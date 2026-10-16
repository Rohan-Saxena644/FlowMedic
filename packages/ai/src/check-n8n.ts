import { config } from "../../shared/src/config.js";
import { checkN8nConnection, getLiveExecutionContext } from "./n8n.js";
const integrationId = process.argv[2] ?? config.N8N_INTEGRATION_ID;
if (!integrationId)
  throw Error(
    "Configure N8N_BASE_URL, N8N_API_KEY and N8N_INTEGRATION_ID in .env before running this read-only check.",
  );
const connection = await checkN8nConnection(integrationId);
console.log(JSON.stringify(connection, null, 2));
const [executionId, workflowId] = process.argv.slice(3);
if (executionId && workflowId) {
  const context = await getLiveExecutionContext(
    integrationId,
    executionId,
    workflowId,
  );
  if (context.execution && context.workflow) {
    console.log(
      JSON.stringify(
        {
          execution: context.execution.available
            ? { available: true }
            : { available: false, code: context.execution.code },
          workflow: context.workflow.available
            ? { available: true }
            : { available: false, code: context.workflow.code },
        },
        null,
        2,
      ),
    );
    if (!context.execution.available || !context.workflow.available)
      process.exitCode = 1;
  } else process.exitCode = 1;
}
if (!connection.readable) process.exitCode = 1;
