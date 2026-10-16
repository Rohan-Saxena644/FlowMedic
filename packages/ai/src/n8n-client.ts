import { z } from "zod";
import { redact } from "@flowmedic/shared";

const sourceId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,128}$/, "Invalid n8n source ID");
const resource = z
  .object({ id: z.union([z.string(), z.number()]) })
  .passthrough();
const workflowList = z.object({ data: z.array(resource) }).passthrough();
export type N8nReadResult =
  | { available: true; data: unknown }
  | { available: false; code: string; reason: string; status?: number };

/** A read-only Public API client. The base URL is trusted operator configuration. */
export class N8nClient {
  private baseUrl: string;
  constructor(
    private options: {
      baseUrl: string;
      apiKey: string;
      timeoutMs?: number;
      maxResponseBytes?: number;
    },
  ) {
    const url = new URL(options.baseUrl);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw Error(
        "n8n base URL must use HTTP(S), without credentials, query or fragment.",
      );
    if (!options.apiKey) throw Error("n8n API key is required.");
    this.baseUrl = url.toString().replace(/\/$/, "");
  }
  private async read(path: string, schema: z.ZodType): Promise<N8nReadResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/${path}`, {
        headers: { "X-N8N-API-KEY": this.options.apiKey },
        redirect: "manual",
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        return {
          available: false,
          code:
            response.status >= 300 && response.status < 400
              ? "REDIRECT_REFUSED"
              : response.status === 401 || response.status === 403
                ? "ACCESS_DENIED"
                : "HTTP_ERROR",
          status: response.status,
          reason:
            response.status >= 300 && response.status < 400
              ? "n8n redirected the request. Configure its final base URL explicitly."
              : response.status === 401 || response.status === 403
                ? "n8n refused this API key or its resource permissions."
                : `n8n returned HTTP ${response.status}.`,
        };
      }
      const limit = this.options.maxResponseBytes ?? 2_000_000;
      if (Number(response.headers.get("content-length")) > limit) {
        await response.body?.cancel();
        return {
          available: false,
          code: "TOO_LARGE",
          reason: "n8n context exceeds the configured response size limit.",
        };
      }
      const reader = response.body?.getReader();
      if (!reader)
        return {
          available: false,
          code: "INVALID_RESPONSE",
          reason: "n8n returned an empty response.",
        };
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > limit) {
            await reader.cancel();
            return {
              available: false,
              code: "TOO_LARGE",
              reason: "n8n context exceeds the configured response size limit.",
            };
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const parsed = schema.safeParse(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
      );
      if (!parsed.success)
        return {
          available: false,
          code: "INVALID_RESPONSE",
          reason:
            "n8n returned a response that does not match the expected Public API shape.",
        };
      return { available: true, data: redact(parsed.data) };
    } catch (error) {
      return {
        available: false,
        code:
          error instanceof SyntaxError
            ? "INVALID_RESPONSE"
            : error instanceof Error &&
                ["TimeoutError", "AbortError"].includes(error.name)
              ? "TIMEOUT"
              : "CONNECTION_FAILED",
        reason:
          error instanceof SyntaxError
            ? "n8n returned invalid JSON."
            : "n8n could not be read within the configured connection and timeout limits.",
      };
    }
  }
  getExecution(id: string) {
    sourceId.parse(id);
    return this.read(
      `executions/${encodeURIComponent(id)}?includeData=true`,
      resource.refine(
        (value) => String(value.id) === id,
        "Execution identity does not match the request",
      ),
    );
  }
  getWorkflow(id: string) {
    sourceId.parse(id);
    return this.read(
      `workflows/${encodeURIComponent(id)}`,
      resource.refine(
        (value) => String(value.id) === id,
        "Workflow identity does not match the request",
      ),
    );
  }
  checkConnection() {
    return this.read("workflows?limit=1", workflowList);
  }
}
