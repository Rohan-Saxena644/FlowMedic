import { config } from "../../shared/src/config.js";
import { N8nClient, type N8nReadResult } from "./n8n-client.js";

function clientFor(integrationId: string) {
  if (
    !config.N8N_BASE_URL ||
    !config.N8N_API_KEY ||
    config.N8N_INTEGRATION_ID !== integrationId
  )
    return undefined;
  return new N8nClient({
    baseUrl: config.N8N_BASE_URL,
    apiKey: config.N8N_API_KEY,
  });
}
export async function checkN8nConnection(integrationId: string) {
  let client: N8nClient | undefined;
  try {
    client = clientFor(integrationId);
  } catch {
    return {
      configured: true,
      readable: false,
      code: "INVALID_CONFIGURATION",
      reason:
        "Use an HTTP(S) n8n base URL without embedded credentials, query parameters or fragments.",
      checkedAt: new Date().toISOString(),
      liveRetryEnabled: false,
    };
  }
  if (!client)
    return {
      configured: false,
      readable: false,
      code: "NOT_CONFIGURED",
      reason:
        "Set N8N_BASE_URL, N8N_API_KEY and this integration ID in the server environment.",
      checkedAt: new Date().toISOString(),
      liveRetryEnabled: false,
    };
  const result = await client.checkConnection();
  return {
    configured: true,
    readable: result.available,
    code: result.available ? "CONNECTED" : result.code,
    reason: result.available
      ? "n8n Public API workflow-list access verified. Individual workflow and execution permissions may differ."
      : result.reason,
    checkedAt: new Date().toISOString(),
    liveRetryEnabled: false,
  };
}
/** Events can select source IDs, but never endpoints or API credentials. */
export async function getLiveExecutionContext(
  integrationId: string,
  executionId: string | null,
  workflowId: string,
) {
  const client = clientFor(integrationId);
  if (!client)
    return {
      available: false,
      reason:
        "Live n8n evidence adapter is not configured for this integration.",
    };
  const safely = async (
    read: () => Promise<N8nReadResult>,
  ): Promise<N8nReadResult> => {
    try {
      return await read();
    } catch {
      return {
        available: false,
        code: "INVALID_SOURCE_ID",
        reason: "Source identity is not a valid n8n resource ID.",
      };
    }
  };
  const [execution, workflow] = await Promise.all([
    executionId
      ? safely(() => client.getExecution(executionId))
      : Promise.resolve<N8nReadResult>({
          available: false,
          code: "MISSING_SOURCE_ID",
          reason: "No source execution ID was supplied.",
        }),
    safely(() => client.getWorkflow(workflowId)),
  ]);
  return {
    available: execution.available || workflow.available,
    execution,
    workflow,
  };
}
