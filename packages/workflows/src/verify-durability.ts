import { NativeConnection, Worker } from "@temporalio/worker";
import { Client, Connection } from "@temporalio/client";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { config } from "../../shared/src/config.js";

// Infrastructure verification only: model and recovery activities are test doubles.
// It does not count as model inference or a successful product investigation.
const taskQueue = `flowmedic-durability-test-${randomUUID()}`;
const connection = await NativeConnection.connect({
  address: config.TEMPORAL_ADDRESS,
});
const clientConnection = await Connection.connect({
  address: config.TEMPORAL_ADDRESS,
});
const client = new Client({
  connection: clientConnection,
  namespace: config.TEMPORAL_NAMESPACE,
});
let arrived!: () => void;
const waiting = new Promise<void>((r) => {
  arrived = r;
});
let recoveryCount = 0;
const options = {
  connection,
  namespace: config.TEMPORAL_NAMESPACE,
  taskQueue,
  workflowsPath: fileURLToPath(new URL("./workflow.ts", import.meta.url)),
  activities: {
    loadIncidentContext: async () => {},
    classifyIncident: async () => {},
    runAIAgentInvestigation: async () => {},
    prepareRecoveryProposal: async () => {
      arrived();
      return { delaySeconds: 0 };
    },
    readDecision: async () => "approve",
    executeApprovedRecovery: async () => {
      recoveryCount++;
    },
    recordDecision: async () => {},
    recordFailure: async () => {
      throw Error("Unexpected failure");
    },
  },
};
const worker1 = await Worker.create(options);
const run1 = worker1.run();
const handle = await client.workflow.start("investigationWorkflow", {
  workflowId: taskQueue,
  taskQueue,
  args: ["durability-test-only"],
});
await Promise.race([
  waiting,
  new Promise((_, reject) =>
    setTimeout(() => reject(Error("Approval wait not reached")), 30000).unref(),
  ),
]);
worker1.shutdown();
await run1;
assert.equal((await handle.describe()).status.name, "RUNNING");
// Deliver while no worker is running. Temporal stores the signal durably.
await handle.signal("decision");
const worker2 = await Worker.create(options);
const run2 = worker2.run();
await handle.result();
assert.equal(recoveryCount, 1);
worker2.shutdown();
await run2;
await connection.close();
await clientConnection.close();
console.log(
  "PASS: actual Temporal workflow retained approval wait across worker shutdown, accepted a signal while offline, and resumed exactly one test recovery. AI/recovery were test doubles.",
);
