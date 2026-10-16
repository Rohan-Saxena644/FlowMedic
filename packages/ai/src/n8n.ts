import { redact } from "@flowmedic/shared";
import { config } from "../../shared/src/config.js";

/** Only operator-configured endpoints are permitted. Never accept URLs from events. */
export async function getLiveExecutionContext(
  integrationId: string,
  executionId: string | null,
  workflowId: string,
) {
  if (
    !config.N8N_BASE_URL ||
    !config.N8N_API_KEY ||
    config.N8N_INTEGRATION_ID !== integrationId
  )
    return {
      available: false,
      reason:
        "Live n8n evidence adapter is not configured for this integration.",
    };
  const base = new URL(config.N8N_BASE_URL);
  if (
    base.username ||
    base.password ||
    !["http:", "https:"].includes(base.protocol)
  )
    throw Error("Invalid trusted n8n base URL");
  async function read(path: string) {
    const response = await fetch(
      `${base.toString().replace(/\/$/, "")}/api/v1/${path}`,
      {
        headers: { "X-N8N-API-KEY": config.N8N_API_KEY! },
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) return { available: false, status: response.status };
    const text = await response.text();
    if (text.length > 2_000_000)
      return {
        available: false,
        reason: "Execution context exceeds 2MB limit; inspect it in n8n.",
      };
    return { available: true, data: redact(JSON.parse(text)) };
  }
  const [execution, workflow] = await Promise.all([
    executionId
      ? read(`executions/${encodeURIComponent(executionId)}?includeData=true`)
      : Promise.resolve({ available: false, reason: "No source execution ID" }),
    read(`workflows/${encodeURIComponent(workflowId)}`),
  ]);
  return { available: true, execution, workflow };
}
