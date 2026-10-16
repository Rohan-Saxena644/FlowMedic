import {
  db,
  incidents,
  runs,
  proposals,
  attempts,
  eq,
  and,
  audit,
  sql,
  isNull,
  audits,
} from "@flowmedic/db";
import { classify, retryPolicy, type Diagnosis } from "@flowmedic/shared";
import { config } from "../../shared/src/config.js";
import { investigate } from "@flowmedic/ai";
async function load(id: string) {
  const row = await db.query.incidents.findFirst({
    where: eq(incidents.id, id),
  });
  if (!row) throw Error("Incident not found");
  return row;
}
export async function loadIncidentContext(id: string) {
  await db
    .update(incidents)
    .set({ status: "INVESTIGATING", updatedAt: new Date() })
    .where(and(eq(incidents.id, id), eq(incidents.status, "RECEIVED")));
  await audit(id, "context", "Loaded persisted, redacted execution context.");
}
export async function classifyIncident(id: string) {
  const i = await load(id);
  await db
    .update(incidents)
    .set({ category: classify(i.message) })
    .where(eq(incidents.id, id));
  await audit(
    id,
    "classification",
    `Deterministic classification: ${classify(i.message)}. This is a baseline, not an AI diagnosis.`,
  );
}
export async function runAIAgentInvestigation(id: string) {
  const i = await load(id);
  if (i.diagnosis) return;
  const result = await investigate(id);
  await persistInvestigation(id, { ...result, model: config.MODEL_ID });
}
export async function persistInvestigation(
  id: string,
  result: { diagnosis: Diagnosis; latencyMs: number; model: string },
) {
  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(incidents)
      .set({ diagnosis: result.diagnosis })
      .where(
        and(
          eq(incidents.id, id),
          eq(incidents.status, "INVESTIGATING"),
          isNull(incidents.diagnosis),
        ),
      )
      .returning({ id: incidents.id });
    if (!claimed.length) return false;
    await tx.insert(runs).values({
      incidentId: id,
      model: result.model,
      latencyMs: result.latencyMs,
    });
    await tx.insert(audits).values({
      incidentId: id,
      stage: "diagnosis",
      detail: `Mastra completed model inference using ${result.model}; structured result validated (${result.latencyMs}ms).`,
    });
    return true;
  });
}
export async function prepareRecoveryProposal(id: string) {
  const i = await load(id);
  const policy = retryPolicy(i.message, i.evidence, i.mode);
  await db.transaction(async (tx) => {
    await tx
      .insert(proposals)
      .values({ incidentId: id, ...policy })
      .onConflictDoNothing();
    await tx
      .update(incidents)
      .set({ status: "AWAITING_APPROVAL", updatedAt: new Date() })
      .where(and(eq(incidents.id, id), eq(incidents.status, "INVESTIGATING")));
  });
  await audit(id, "approval-wait", policy.reason);
  return policy;
}
export async function readDecision(id: string) {
  const p = await db.query.proposals.findFirst({
    where: eq(proposals.incidentId, id),
  });
  if (!p?.decision) throw Error("Decision not persisted");
  return p.decision;
}
export async function executeApprovedRecovery(id: string) {
  const i = await load(id);
  const p = await db.query.proposals.findFirst({
    where: eq(proposals.incidentId, id),
  });
  if (
    p?.decision !== "approve" ||
    !p.eligible ||
    !retryPolicy(i.message, i.evidence, i.mode).eligible
  )
    throw Error("Recovery is not authorized or safe");
  // Atomic at-most-once claim. Never retry an uncertain external side effect.
  return db.transaction(async (tx) => {
    const claim = await tx
      .update(incidents)
      .set({ status: "RECOVERED", updatedAt: new Date() })
      .where(
        and(eq(incidents.id, id), eq(incidents.status, "RECOVERY_RUNNING")),
      )
      .returning({ id: incidents.id });
    if (!claim.length) return false;
    await tx
      .insert(attempts)
      .values({
        incidentId: id,
        mode: "demo",
        outcome: "SIMULATED_RECOVERY_SUCCEEDED",
      });
    await tx
      .insert(audits)
      .values({
        incidentId: id,
        stage: "recovery",
        detail:
          "Demo adapter: the simulated rate limit cleared after backoff. No live n8n execution was retried.",
      });
    return true;
  });
}
export async function recordDecision(id: string, decision: string) {
  await db
    .update(incidents)
    .set({
      status: decision === "reject" ? "REJECTED" : "MANUAL_ACTION_REQUIRED",
      updatedAt: new Date(),
    })
    .where(
      and(eq(incidents.id, id), eq(incidents.status, "AWAITING_APPROVAL")),
    );
  await audit(
    id,
    "decision-applied",
    decision === "reject"
      ? "Operator rejected the recommendation."
      : "Operator marked for manual resolution; no automated recovery performed.",
  );
}
export async function recordFailure(id: string) {
  await db
    .update(incidents)
    .set({
      status: "FAILED",
      error:
        "Investigation or recovery activity failed. Check worker logs and model availability; no recovery is assumed.",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(incidents.id, id),
        sql`${incidents.status} NOT IN ('RECOVERED','REJECTED','MANUAL_ACTION_REQUIRED')`,
      ),
    );
  await audit(
    id,
    "failed",
    "Activity retries exhausted. No AI diagnosis or successful recovery has been fabricated.",
  );
}
