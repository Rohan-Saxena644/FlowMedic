import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import {
  randomBytes,
  createHash,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import { z } from "zod";
import {
  db,
  pool,
  integrations,
  incidents,
  audits,
  proposals,
  attempts,
  runs,
  eq,
  and,
  audit,
  isNull,
  sql,
} from "@flowmedic/db";
import { modelHealth, checkN8nConnection } from "@flowmedic/ai";
import { config } from "../../../packages/shared/src/config.js";
import { fixture } from "./fixtures.js";
import { ingest, temporal } from "./ingest.js";
import { listIncidents } from "./incident-list.js";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function buildApp() {
  const app = Fastify({
    logger: { redact: ["req.headers.authorization", "req.headers.cookie"] },
    bodyLimit: 262144,
    genReqId: () => randomUUID(),
  });
  app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  app.setErrorHandler((err, req, reply) => {
    const error = err as Error & { statusCode?: number };
    const status =
      error instanceof z.ZodError ? 400 : (error.statusCode ?? 500);
    if (status >= 500)
      req.log.error({ name: error.name, requestId: req.id }, "Request failed");
    reply.code(status).send({
      error: {
        code:
          status === 400
            ? "VALIDATION_ERROR"
            : status === 500
              ? "INTERNAL_ERROR"
              : "REQUEST_ERROR",
        message:
          status >= 500
            ? "Request failed. Check service health and server logs."
            : error.message,
        requestId: req.id,
      },
    });
  });
  app.addHook("onRequest", async (req, reply) => {
    reply.header("x-request-id", req.id);
    if (
      req.url.split("?")[0] === "/api/v1/health" ||
      req.url.split("?")[0] === "/api/v1/events/n8n"
    )
      return;
    const given = Buffer.from(hash(req.headers.authorization ?? ""));
    const expected = Buffer.from(hash(`Bearer ${config.OPERATOR_TOKEN}`));
    if (!timingSafeEqual(given, expected))
      return reply.code(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "Operator authentication required",
          requestId: req.id,
        },
      });
  });
  app.get("/api/v1/health", async (_, reply) => {
    let database = false,
      temporalAvailable = false;
    try {
      await pool.query("select 1");
      database = true;
    } catch {}
    try {
      await (await temporal()).workflowService.getSystemInfo({});
      temporalAvailable = true;
    } catch {}
    const model = await modelHealth();
    return reply
      .code(database && temporalAvailable && model.available ? 200 : 503)
      .send({ database, temporal: temporalAvailable, model });
  });
  app.post("/api/v1/events/n8n", async (req, reply) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer "))
      return reply.code(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "Integration bearer secret required",
        },
      });
    const integration = await db.query.integrations.findFirst({
      where: eq(integrations.secretHash, hash(auth.slice(7))),
    });
    if (!integration)
      return reply.code(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid integration secret",
        },
      });
    const result = await ingest(integration, req.body);
    return reply.code(result.duplicate ? 200 : 202).send({
      id: result.incident.id,
      duplicate: result.duplicate,
      scheduling: result.scheduling,
    });
  });
  app.get("/api/v1/incidents", async (req) => listIncidents(req.query));
  app.get("/api/v1/metrics", async () => {
    const [totals] = await db
      .select({
        total: sql<number>`count(*)::int`,
        investigating: sql<number>`count(*) FILTER (WHERE ${incidents.status} IN ('RECEIVED','INVESTIGATING'))::int`,
        awaitingApproval: sql<number>`count(*) FILTER (WHERE ${incidents.status} = 'AWAITING_APPROVAL')::int`,
        recovered: sql<number>`count(*) FILTER (WHERE ${incidents.status} = 'RECOVERED')::int`,
      })
      .from(incidents);
    const [latency] = await db
      .select({
        averageLatencyMs: sql<number | null>`avg(${runs.latencyMs})::int`,
      })
      .from(runs);
    const categories = await db
      .select({
        category: incidents.category,
        count: sql<number>`count(*)::int`,
      })
      .from(incidents)
      .groupBy(incidents.category)
      .orderBy(incidents.category);
    return { ...totals, ...latency, categories };
  });
  app.get("/api/v1/incidents/:id", async (req, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const i = await db.query.incidents.findFirst({
      where: eq(incidents.id, id),
    });
    if (!i)
      return reply
        .code(404)
        .send({ error: { code: "NOT_FOUND", message: "Incident not found" } });
    return {
      ...i,
      proposal: await db.query.proposals.findFirst({
        where: eq(proposals.incidentId, id),
      }),
      attempt: await db.query.attempts.findFirst({
        where: eq(attempts.incidentId, id),
      }),
      run: await db.query.runs.findFirst({ where: eq(runs.incidentId, id) }),
      evidenceTrace: await db.query.evidence.findMany({
        where: (e, { eq }) => eq(e.incidentId, id),
      }),
    };
  });
  app.get("/api/v1/incidents/:id/timeline", async (req) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    return db
      .select()
      .from(audits)
      .where(eq(audits.incidentId, id))
      .orderBy(audits.createdAt);
  });
  for (const decision of ["approve", "reject", "resolve"] as const)
    app.post(`/api/v1/incidents/:id/${decision}`, async (req, reply) => {
      const { id } = z.object({ id: z.uuid() }).parse(req.params);
      const won = await db.transaction(async (tx) => {
        const updated = await tx
          .update(proposals)
          .set({ decision })
          .where(
            and(
              eq(proposals.incidentId, id),
              isNull(proposals.decision),
              ...(decision === "approve" ? [eq(proposals.eligible, true)] : []),
            ),
          )
          .returning();
        if (updated[0] && decision === "approve")
          await tx
            .update(incidents)
            .set({ status: "RECOVERY_RUNNING", updatedAt: new Date() })
            .where(
              and(
                eq(incidents.id, id),
                eq(incidents.status, "AWAITING_APPROVAL"),
              ),
            );
        return updated[0];
      });
      if (!won) {
        const p = await db.query.proposals.findFirst({
          where: eq(proposals.incidentId, id),
        });
        if (p?.decision !== decision)
          return reply.code(409).send({
            error: {
              code: "DECISION_CONFLICT",
              message:
                "No eligible proposal, or another decision has already been recorded.",
            },
          });
      }
      if (decision === "approve")
        await db
          .update(incidents)
          .set({ status: "RECOVERY_RUNNING", updatedAt: new Date() })
          .where(
            and(
              eq(incidents.id, id),
              eq(incidents.status, "AWAITING_APPROVAL"),
            ),
          );
      await audit(
        id,
        "operator-decision",
        `Authenticated operator chose ${decision}.`,
      );
      try {
        await (
          await temporal()
        ).workflow
          .getHandle(`investigation-${id}`)
          .signal("decision");
      } catch {
        return reply.code(202).send({ decision, delivery: "pending" });
      }
      return { decision, delivery: "signalled" };
    });
  app.get("/api/v1/integrations", async () =>
    db
      .select({
        id: integrations.id,
        name: integrations.name,
        mode: integrations.mode,
        createdAt: integrations.createdAt,
      })
      .from(integrations),
  );
  app.post("/api/v1/integrations", async (req, reply) => {
    const { name } = z
      .object({ name: z.string().min(1).max(100) })
      .strict()
      .parse(req.body);
    const secret = randomBytes(32).toString("hex");
    const [i] = await db
      .insert(integrations)
      .values({ name, secretHash: hash(secret), mode: "live" })
      .returning({
        id: integrations.id,
        name: integrations.name,
        mode: integrations.mode,
      });
    return reply.code(201).send({ ...i, secret });
  });
  app.post("/api/v1/integrations/:id/check", async (req, reply) => {
    z.object({}).strict().optional().parse(req.body);
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const integration = await db.query.integrations.findFirst({
      where: eq(integrations.id, id),
    });
    if (!integration)
      return reply.code(404).send({
        error: { code: "NOT_FOUND", message: "Integration not found" },
      });
    if (integration.mode === "demo")
      return {
        configured: false,
        readable: false,
        code: "DEMO_INTEGRATION",
        reason:
          "Demo events use stored fixtures; no live n8n connection is configured.",
        checkedAt: new Date().toISOString(),
        liveRetryEnabled: false,
      };
    return checkN8nConnection(id);
  });
  app.post("/api/v1/demo/scenarios/:scenario", async (req, reply) => {
    const { scenario } = z
      .object({
        scenario: z.enum([
          "rate-limit",
          "schema-mismatch",
          "ambiguous-timeout",
        ]),
      })
      .parse(req.params);
    let integration = await db.query.integrations.findFirst({
      where: eq(integrations.mode, "demo"),
    });
    if (!integration) {
      [integration] = await db
        .insert(integrations)
        .values({
          name: "Demo agency · Sandbox",
          secretHash: hash(randomBytes(32).toString("hex")),
          mode: "demo",
        })
        .returning();
    }
    const result = await ingest(integration!, fixture(scenario));
    return reply
      .code(202)
      .send({ id: result.incident.id, scheduling: result.scheduling });
  });
  return app;
}
