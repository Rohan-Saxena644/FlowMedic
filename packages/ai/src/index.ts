import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { classify, redact, retryPolicy } from "@flowmedic/shared";
import { config } from "../../shared/src/config.js";
import { db, incidents, eq, and, desc, audit, evidence } from "@flowmedic/db";
import { getLiveExecutionContext } from "./n8n.js";
import { generateInvestigation } from "./generate.js";
export { checkN8nConnection } from "./n8n.js";

export async function modelHealth() {
  try {
    const r = await fetch(`${config.MODEL_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${config.MODEL_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw Error(`Model server HTTP ${r.status}`);
    const body = (await r.json()) as { data?: { id: string }[] };
    return {
      available: body.data?.some((m) => m.id === config.MODEL_ID) ?? false,
      model: config.MODEL_ID,
    };
  } catch {
    return { available: false, model: config.MODEL_ID };
  }
}

export async function investigate(id: string) {
  const incident = await db.query.incidents.findFirst({
    where: eq(incidents.id, id),
  });
  if (!incident) throw Error("Incident not found");
  const related = await db
    .select({
      id: incidents.id,
      category: incidents.category,
      message: incidents.message,
    })
    .from(incidents)
    .where(eq(incidents.workflowId, incident.workflowId))
    .orderBy(desc(incidents.createdAt))
    .limit(6);
  const workflow = await db.query.workflows.findFirst({
    where: (w, { eq }) => eq(w.id, incident.workflowId),
  });
  let live: unknown;
  if (incident.mode === "live")
    try {
      live = await getLiveExecutionContext(
        incident.integrationId,
        incident.executionId,
        workflow?.sourceId ?? "unknown",
      );
    } catch {
      live = {
        available: false,
        reason:
          "Live evidence fetch failed; use incoming error context and state missing information.",
      };
    }
  const snapshots: Record<string, unknown> = {
    failure: {
      message: incident.message,
      node: incident.failedNode,
      classification: classify(incident.message),
    },
    execution: { incoming: incident.evidence, ...(live ? { live } : {}) },
    workflow: { name: incident.workflowName, sourceId: workflow?.sourceId },
    related: related.filter((r) => r.id !== id),
    safety: retryPolicy(incident.message, incident.evidence, incident.mode),
  };
  const inputSchema = z.object({ incidentId: z.literal(id) });
  const tool = (name: string, ref: string, description: string) =>
    createTool({
      id: name,
      description,
      inputSchema,
      outputSchema: z.object({ ref: z.string(), data: z.unknown() }),
      execute: async () => {
        const data = redact(snapshots[ref]);
        const [inserted] = await db
          .insert(evidence)
          .values({ incidentId: id, ref, data })
          .onConflictDoNothing()
          .returning();
        const snapshot =
          inserted ??
          (await db.query.evidence.findFirst({
            where: and(eq(evidence.incidentId, id), eq(evidence.ref, ref)),
          }));
        if (!snapshot) throw Error("Evidence snapshot could not be persisted");
        await audit(
          id,
          `tool:${ref}`,
          `Read-only evidence tool completed: ${name}`,
        );
        return { ref, data: snapshot.data };
      },
    });
  const tools = {
    getExecutionDetails: tool(
      "getExecutionDetails",
      "execution",
      "Read redacted stored execution evidence; never fetch event URLs.",
    ),
    getWorkflowMetadata: tool(
      "getWorkflowMetadata",
      "workflow",
      "Read known workflow metadata.",
    ),
    getFailureContext: tool(
      "getFailureContext",
      "failure",
      "Read observed error and deterministic category.",
    ),
    searchRelatedIncidents: tool(
      "searchRelatedIncidents",
      "related",
      "Read related persisted failures, which are not proof of this cause.",
    ),
    getRetrySafetyContext: tool(
      "getRetrySafetyContext",
      "safety",
      "Read deterministic retry policy, which cannot be overridden.",
    ),
  };
  // Gemma 3 does not promise native function calling. Execute the validated read-only
  // evidence tools explicitly, then let Mastra reason over their immutable results.
  const gathered = [];
  for (const t of Object.values(tools))
    gathered.push(await t.execute!({ incidentId: id }, {} as never));
  const health = await modelHealth();
  if (!health.available)
    throw Error(
      `Configured model ${config.MODEL_ID} is unavailable. Pull it in Ollama and check MODEL_BASE_URL.`,
    );
  return generateInvestigation(
    {
      id,
      failedNode: incident.failedNode,
      workflowName: incident.workflowName,
      message: incident.message,
      evidence: gathered,
    },
    {
      onRejected: async (attempt, detail) => {
        await audit(
          id,
          `ai-validation:${Date.now()}:${attempt}`,
          `Model attempt ${attempt + 1} rejected: ${detail}`,
        );
      },
    },
  );
}
