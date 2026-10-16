import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

export const category = z.enum([
  "AUTHENTICATION_FAILURE",
  "RATE_LIMIT",
  "NETWORK_TIMEOUT",
  "PAYLOAD_SCHEMA_MISMATCH",
  "MISSING_REQUIRED_FIELD",
  "INVALID_CREDENTIALS",
  "UPSTREAM_SERVICE_ERROR",
  "UNKNOWN",
]);
export const diagnosisSchema = z
  .object({
    category,
    rootCause: z.string().min(1),
    explanation: z.string().min(1),
    evidenceRefs: z.array(z.string()).min(1),
    recommendedFix: z.string(),
    retryRecommendation: z.enum([
      "AFTER_BACKOFF",
      "AFTER_CORRECTION",
      "MANUAL_VERIFICATION",
      "DO_NOT_RETRY",
    ]),
    retryRisk: z.enum(["LOW", "HIGH", "UNKNOWN"]),
    missingInformation: z.array(z.string()),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type Diagnosis = z.infer<typeof diagnosisSchema>;
const errorSchema = z
  .object({ message: z.string().optional(), stack: z.string().optional() })
  .passthrough();
export const eventSchema = z
  .object({
    eventId: z.string().optional(),
    timestamp: z.string().datetime().optional(),
    workflow: z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
        name: z.string().optional(),
      })
      .passthrough(),
    execution: z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
        url: z.string().optional(),
        error: errorSchema.optional(),
        lastNodeExecuted: z.string().optional(),
        mode: z.string().optional(),
        retryOf: z.union([z.string(), z.number()]).optional(),
      })
      .passthrough()
      .optional(),
    trigger: z
      .object({ error: errorSchema.optional() })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .refine(
    (v) => Boolean(v.execution?.error?.message || v.trigger?.error?.message),
    "An execution or trigger error message is required",
  );
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        /authorization|cookie|secret|password|token|api.?key|credential/i.test(
          k,
        )
          ? "[REDACTED]"
          : redact(v),
      ]),
    );
  if (typeof value === "string")
    return value
      .replace(/\b(Bearer|Basic)\s+[\w.+/=-]+/gi, "$1 [REDACTED]")
      .replace(
        /([?&](?:api[_-]?key|token|secret|password)=)[^&\s]+/gi,
        "$1[REDACTED]",
      )
      .replace(/\b(sk-[\w-]{10,})\b/g, "[REDACTED]")
      .replace(
        /((?:api[_-]?key|password|secret|token)\s*[:=]\s*)[^\s,;]+/gi,
        "$1[REDACTED]",
      );
  return value;
}
export function normalize(input: unknown) {
  const raw = eventSchema.parse(redact(input));
  const execution = raw.execution;
  // Without an upstream identity or timestamp, merging deliveries risks losing unrelated failures.
  const identity = execution?.id
    ? `execution:${execution.id}`
    : raw.eventId
      ? `event:${raw.eventId}`
      : raw.timestamp
        ? `fingerprint:${createHash("sha256").update(canonical(raw)).digest("hex")}`
        : `unidentified:${randomUUID()}`;
  return {
    identity,
    workflowId: String(raw.workflow.id ?? "unknown"),
    workflowName: raw.workflow.name ?? "Unnamed workflow",
    executionId: execution?.id ? String(execution.id) : null,
    executionUrl: execution?.url ?? null,
    failedNode: execution?.lastNodeExecuted ?? "Trigger / unknown node",
    message: execution?.error?.message ?? raw.trigger!.error!.message!,
    timestamp: raw.timestamp ?? new Date().toISOString(),
    evidence: raw,
  };
}
function canonical(v: unknown): string {
  return JSON.stringify(
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, JSON.parse(canonical(x))]),
        )
      : v,
  );
}
export function classify(message: string): z.infer<typeof category> {
  if (/429|rate.?limit/i.test(message)) return "RATE_LIMIT";
  if (/timeout|timed.?out|ETIMEDOUT/i.test(message)) return "NETWORK_TIMEOUT";
  if (/schema|unexpected field|expected field/i.test(message))
    return "PAYLOAD_SCHEMA_MISMATCH";
  if (/required|missing field/i.test(message)) return "MISSING_REQUIRED_FIELD";
  if (/invalid credential|401/i.test(message)) return "INVALID_CREDENTIALS";
  if (/403|unauthorized|authentication/i.test(message))
    return "AUTHENTICATION_FAILURE";
  if (/50[0234]/.test(message)) return "UPSTREAM_SERVICE_ERROR";
  return "UNKNOWN";
}
export function retryPolicy(message: string, evidence: unknown, mode: string) {
  const c = classify(message);
  const e = z
    .object({
      recovery: z
        .object({
          idempotent: z.boolean(),
          retryAfterSeconds: z.number().nonnegative().max(86400),
        })
        .optional(),
    })
    .parse(evidence);
  const eligible =
    mode === "demo" && c === "RATE_LIMIT" && e.recovery?.idempotent === true;
  return {
    eligible,
    delaySeconds: e.recovery?.retryAfterSeconds ?? 0,
    reason: eligible
      ? "Verified demo idempotent request; bounded backoff and human approval required."
      : c === "NETWORK_TIMEOUT"
        ? "Remote outcome is unknown. Verify side effects before any retry."
        : "Correct and verify the workflow manually. Live retry capabilities are not verified.",
  };
}
export const transitions: Record<string, string[]> = {
  RECEIVED: ["INVESTIGATING", "FAILED"],
  INVESTIGATING: ["AWAITING_APPROVAL", "FAILED"],
  AWAITING_APPROVAL: ["RECOVERY_RUNNING", "REJECTED", "MANUAL_ACTION_REQUIRED"],
  RECOVERY_RUNNING: ["RECOVERED", "FAILED"],
};
export function assertTransition(from: string, to: string) {
  if (!transitions[from]?.includes(to))
    throw new Error(`Invalid transition ${from} → ${to}`);
}
