import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import { fixture } from "../apps/api/src/fixtures";
import { diagnosisSchema } from "../packages/shared/src/index";
describe.skipIf(process.env.RUN_INTEGRATION !== "1")(
  "PostgreSQL and Temporal integration",
  () => {
    let app: Awaited<
      ReturnType<(typeof import("../apps/api/src/app"))["buildApp"]>
    >;
    let store: typeof import("../packages/db/src/index");
    let config: (typeof import("../packages/shared/src/config"))["config"];
    let integrationId: string, secret: string;
    const ids: string[] = [];
    beforeAll(async () => {
      process.env.TEMPORAL_TASK_QUEUE = `flowmedic-integration-test-${randomBytes(8).toString("hex")}`;
      store = await import("../packages/db/src/index");
      config = (await import("../packages/shared/src/config")).config;
      const { buildApp } = await import("../apps/api/src/app");
      app = buildApp();
      await app.ready();
      const r = await app.inject({
        method: "POST",
        url: "/api/v1/integrations",
        headers: { authorization: `Bearer ${config.OPERATOR_TOKEN}` },
        payload: { name: "Integration verification" },
      });
      expect(r.statusCode).toBe(201);
      integrationId = r.json().id;
      secret = r.json().secret;
    });
    afterAll(async () => {
      if (app) await app.close();
      if (store) {
        const { temporal } = await import("../apps/api/src/ingest");
        const { db, eq } = store;
        for (const id of ids) {
          try {
            await (
              await temporal()
            ).workflow
              .getHandle(`investigation-${id}`)
              .terminate("Disposable integration-test cleanup");
          } catch {}
          await db
            .delete(store.attempts)
            .where(eq(store.attempts.incidentId, id));
          await db
            .delete(store.proposals)
            .where(eq(store.proposals.incidentId, id));
          await db
            .delete(store.evidence)
            .where(eq(store.evidence.incidentId, id));
          await db.delete(store.runs).where(eq(store.runs.incidentId, id));
          await db.delete(store.audits).where(eq(store.audits.incidentId, id));
          await db.delete(store.incidents).where(eq(store.incidents.id, id));
        }
        if (integrationId) {
          await db
            .delete(store.workflows)
            .where(eq(store.workflows.integrationId, integrationId));
          await db
            .delete(store.integrations)
            .where(eq(store.integrations.id, integrationId));
        }
        await store.pool.end();
      }
    });
    it("rejects unauthenticated operator controls and invalid events", async () => {
      expect((await app.inject({ url: "/api/v1/incidents" })).statusCode).toBe(
        401,
      );
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/events/n8n",
            headers: { authorization: `Bearer ${secret}` },
            payload: { workflow: {} },
          })
        ).statusCode,
      ).toBe(400);
    });
    it("secures integration diagnostics and reports missing configuration without leaking secrets", async () => {
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/api/v1/integrations/${integrationId}/check`,
          })
        ).statusCode,
      ).toBe(401);
      const result = await app.inject({
        method: "POST",
        url: `/api/v1/integrations/${integrationId}/check`,
        headers: { authorization: `Bearer ${config.OPERATOR_TOKEN}` },
      });
      expect(result.statusCode).toBe(200);
      expect(result.json()).toMatchObject({
        configured: false,
        readable: false,
        code: "NOT_CONFIGURED",
        liveRetryEnabled: false,
      });
      expect(result.body).not.toContain(secret);
      const overridden = await app.inject({
        method: "POST",
        url: `/api/v1/integrations/${integrationId}/check`,
        headers: { authorization: `Bearer ${config.OPERATOR_TOKEN}` },
        payload: { baseUrl: "http://other.invalid" },
      });
      expect(overridden.statusCode).toBe(400);
    });
    it("deduplicates concurrent delivery with a real database uniqueness constraint", async () => {
      const payload = fixture("rate-limit");
      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          app.inject({
            method: "POST",
            url: "/api/v1/events/n8n",
            headers: { authorization: `Bearer ${secret}` },
            payload,
          }),
        ),
      );
      const unique = new Set(results.map((r) => r.json().id));
      expect(unique.size).toBe(1);
      expect(results.filter((r) => r.json().duplicate === false)).toHaveLength(
        1,
      );
      const id = results[0].json().id;
      ids.push(id);
      const row = await store.db.query.incidents.findFirst({
        where: store.eq(store.incidents.id, id),
      });
      expect(row).toBeDefined();
      // Temporal scheduling may still be pending after the bounded ingestion response.
      expect(
        results.every((r) =>
          ["scheduled", "pending"].includes(r.json().scheduling),
        ),
      ).toBe(true);
    });
    it("allows one concurrent decision and one simulated recovery attempt", async () => {
      const payload = fixture("rate-limit");
      const event = await app.inject({
        method: "POST",
        url: "/api/v1/events/n8n",
        headers: { authorization: `Bearer ${secret}` },
        payload,
      });
      const id = event.json().id;
      ids.push(id);
      await store.db
        .update(store.incidents)
        .set({ status: "AWAITING_APPROVAL", mode: "demo" })
        .where(store.eq(store.incidents.id, id));
      await store.db.insert(store.proposals).values({
        incidentId: id,
        eligible: true,
        delaySeconds: 0,
        reason: "TEST ONLY: verified simulation",
      });
      const decisions = await Promise.all(
        ["approve", "reject", "resolve"].map((d) =>
          app.inject({
            method: "POST",
            url: `/api/v1/incidents/${id}/${d}`,
            headers: { authorization: `Bearer ${config.OPERATOR_TOKEN}` },
          }),
        ),
      );
      expect(decisions.filter((r) => r.statusCode === 200)).toHaveLength(1);
      expect(decisions.filter((r) => r.statusCode === 409)).toHaveLength(2);
      const p = await store.db.query.proposals.findFirst({
        where: store.eq(store.proposals.incidentId, id),
      });
      expect(p?.decision).toBeTruthy();
      if (p?.decision === "approve") {
        const { executeApprovedRecovery } =
          await import("../packages/workflows/src/activities");
        await Promise.all(
          Array.from({ length: 8 }, () => executeApprovedRecovery(id)),
        );
        const attempts = await store.db
          .select()
          .from(store.attempts)
          .where(store.eq(store.attempts.incidentId, id));
        expect(attempts).toHaveLength(1);
      }
    });
    it("keeps diagnosis, model latency and audit consistent under overlapping activity completions", async () => {
      const payload = fixture("rate-limit");
      payload.workflow.name = "TEST ONLY · concurrent diagnosis persistence";
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/events/n8n",
        headers: { authorization: `Bearer ${secret}` },
        payload,
      });
      const id = response.json().id;
      ids.push(id);
      await store.db
        .update(store.incidents)
        .set({ status: "INVESTIGATING" })
        .where(store.eq(store.incidents.id, id));
      const { persistInvestigation } =
        await import("../packages/workflows/src/activities");
      const candidates = Array.from({ length: 8 }, (_, index) => ({
        model: `test-model-${index}`,
        latencyMs: 100 + index,
        diagnosis: diagnosisSchema.parse({
          category: "RATE_LIMIT",
          rootCause: `TEST ONLY hypothesis ${index}.`,
          explanation:
            "TEST ONLY: this fixture verifies transactional concurrency, not model inference.",
          evidenceRefs: ["execution"],
          recommendedFix:
            "TEST ONLY: no recovery or model call is performed by this database test.",
          retryRecommendation: "AFTER_BACKOFF",
          retryRisk: "LOW",
          missingInformation: [],
          confidence: 0,
        }),
      }));
      const outcomes = await Promise.all(
        candidates.map((candidate) => persistInvestigation(id, candidate)),
      );
      expect(outcomes.filter(Boolean)).toHaveLength(1);
      const winner = candidates[outcomes.findIndex(Boolean)];
      const incident = await store.db.query.incidents.findFirst({
        where: store.eq(store.incidents.id, id),
      });
      const run = await store.db.query.runs.findFirst({
        where: store.eq(store.runs.incidentId, id),
      });
      const timeline = await store.db
        .select()
        .from(store.audits)
        .where(
          store.and(
            store.eq(store.audits.incidentId, id),
            store.eq(store.audits.stage, "diagnosis"),
          ),
        );
      expect(incident?.diagnosis).toEqual(winner.diagnosis);
      expect(run).toMatchObject({
        model: winner.model,
        latencyMs: winner.latencyMs,
      });
      expect(timeline).toHaveLength(1);
      expect(timeline[0].detail).toContain(winner.model);
      await store.db
        .update(store.incidents)
        .set({ status: "FAILED" })
        .where(store.eq(store.incidents.id, id));
      expect(await persistInvestigation(id, candidates[0])).toBe(false);
    });
    it("does not record a successful recovery when a late activity reaches a failed incident", async () => {
      const payload = fixture("rate-limit");
      payload.workflow.name = "TEST ONLY · stale recovery completion";
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/events/n8n",
        headers: { authorization: `Bearer ${secret}` },
        payload,
      });
      const id = response.json().id;
      ids.push(id);
      await store.db
        .update(store.incidents)
        .set({ status: "FAILED", mode: "demo" })
        .where(store.eq(store.incidents.id, id));
      await store.db
        .insert(store.proposals)
        .values({
          incidentId: id,
          eligible: true,
          decision: "approve",
          delaySeconds: 0,
          reason: "TEST ONLY: stale activity guard",
        });
      const { executeApprovedRecovery } =
        await import("../packages/workflows/src/activities");
      expect(await executeApprovedRecovery(id)).toBe(false);
      expect(
        await store.db
          .select()
          .from(store.attempts)
          .where(store.eq(store.attempts.incidentId, id)),
      ).toHaveLength(0);
      expect(
        await store.db
          .select()
          .from(store.audits)
          .where(
            store.and(
              store.eq(store.audits.incidentId, id),
              store.eq(store.audits.stage, "recovery"),
            ),
          ),
      ).toHaveLength(0);
      expect(
        (
          await store.db.query.incidents.findFirst({
            where: store.eq(store.incidents.id, id),
          })
        )?.status,
      ).toBe("FAILED");
    });
    it("never leaks integration hashes or secrets on list routes", async () => {
      const result = await app.inject({
        url: "/api/v1/integrations",
        headers: { authorization: `Bearer ${config.OPERATOR_TOKEN}` },
      });
      expect(result.body).not.toContain(secret);
      expect(result.body).not.toContain("secretHash");
    });
  },
);
