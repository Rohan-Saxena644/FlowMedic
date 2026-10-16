import {
  db,
  integrations,
  workflows,
  incidents,
  eq,
  audit,
} from "@flowmedic/db";
import { normalize } from "@flowmedic/shared";
import {
  Client,
  Connection,
  WorkflowExecutionAlreadyStartedError,
} from "@temporalio/client";
import { config } from "../../../packages/shared/src/config.js";
let clientPromise: Promise<Client> | undefined;
export function temporal() {
  return (clientPromise ??= Connection.connect({
    address: config.TEMPORAL_ADDRESS,
  })
    .then(
      (connection) =>
        new Client({ connection, namespace: config.TEMPORAL_NAMESPACE }),
    )
    .catch((e) => {
      clientPromise = undefined;
      throw e;
    }));
}
export async function schedule(id: string) {
  const client = await temporal();
  try {
    await client.workflow.start("investigationWorkflow", {
      workflowId: `investigation-${id}`,
      taskQueue: config.TEMPORAL_TASK_QUEUE,
      args: [id],
      workflowIdReusePolicy: "REJECT_DUPLICATE",
    });
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) throw e;
  }
  await db
    .update(incidents)
    .set({ scheduled: true })
    .where(eq(incidents.id, id));
}
export async function ingest(
  integration: typeof integrations.$inferSelect,
  input: unknown,
) {
  const n = normalize(input);
  const result = await db.transaction(async (tx) => {
    const [w] = await tx
      .insert(workflows)
      .values({
        integrationId: integration.id,
        sourceId: n.workflowId,
        name: n.workflowName,
      })
      .onConflictDoUpdate({
        target: [workflows.integrationId, workflows.sourceId],
        set: { name: n.workflowName },
      })
      .returning();
    const [created] = await tx
      .insert(incidents)
      .values({
        integrationId: integration.id,
        workflowId: w.id,
        sourceIdentity: n.identity,
        workflowName: n.workflowName,
        executionId: n.executionId,
        executionUrl: n.executionUrl,
        failedNode: n.failedNode,
        message: n.message,
        evidence: n.evidence,
        mode: integration.mode,
      })
      .onConflictDoNothing()
      .returning();
    if (created) return { incident: created, duplicate: false };
    const existing = await tx.query.incidents.findFirst({
      where: (i, { and, eq }) =>
        and(
          eq(i.integrationId, integration.id),
          eq(i.sourceIdentity, n.identity),
        ),
    });
    if (!existing) throw Error("Deduplication lookup failed");
    return { incident: existing, duplicate: true };
  });
  await audit(
    result.incident.id,
    "received",
    "n8n failure validated, redacted and persisted.",
  );
  // Persist first: a periodic dispatcher repairs a crash or Temporal outage between commit and start.
  const scheduled = await Promise.race([
    schedule(result.incident.id)
      .then(() => true)
      .catch(() => false),
    new Promise<false>((resolve) =>
      setTimeout(() => resolve(false), 500).unref(),
    ),
  ]);
  return { ...result, scheduling: scheduled ? "scheduled" : "pending" };
}
