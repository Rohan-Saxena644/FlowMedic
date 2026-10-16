import { NativeConnection, Worker } from "@temporalio/worker";
import { fileURLToPath } from "node:url";
import { config } from "../../shared/src/config.js";
import * as activities from "./activities.js";
const connection = await NativeConnection.connect({
  address: config.TEMPORAL_ADDRESS,
});
const worker = await Worker.create({
  connection,
  namespace: config.TEMPORAL_NAMESPACE,
  taskQueue: config.TEMPORAL_TASK_QUEUE,
  workflowsPath: fileURLToPath(new URL("./workflow.ts", import.meta.url)),
  activities,
});
await worker.run();
