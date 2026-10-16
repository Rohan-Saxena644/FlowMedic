import { randomUUID } from "node:crypto";
export function fixture(scenario: string) {
  const base = { eventId: randomUUID(), timestamp: new Date().toISOString() };
  if (scenario === "rate-limit")
    return {
      ...base,
      workflow: { id: "crm-sync", name: "CRM · Contact enrichment" },
      execution: {
        id: randomUUID(),
        lastNodeExecuted: "Read CRM contact",
        mode: "trigger",
        error: {
          message:
            "HTTP 429 Too Many Requests. CRM quota exceeded; Retry-After: 5.",
        },
      },
      recovery: { idempotent: true, retryAfterSeconds: 5 },
      request: { method: "GET", resource: "CRM contact lookup" },
      response: { status: 429, headers: { "Retry-After": "5" } },
    };
  if (scenario === "schema-mismatch")
    return {
      ...base,
      workflow: { id: "crm-update", name: "CRM · Lead handoff" },
      execution: {
        id: randomUUID(),
        lastNodeExecuted: "Update CRM lead",
        mode: "trigger",
        error: {
          message:
            "Payload schema mismatch: expected field email, received email_address.",
        },
      },
      expectedFields: ["email", "first_name"],
      receivedPayload: {
        email_address: "lead@example.test",
        first_name: "Alex",
      },
      recovery: { idempotent: false, retryAfterSeconds: 0 },
    };
  if (scenario === "ambiguous-timeout")
    return {
      ...base,
      workflow: { id: "order-create", name: "Commerce · Order creation" },
      execution: {
        id: randomUUID(),
        lastNodeExecuted: "Create customer order",
        mode: "trigger",
        error: {
          message:
            "ETIMEDOUT: order creation request timed out after request body was sent; remote outcome unknown.",
        },
      },
      request: {
        method: "POST",
        resource: "order creation",
        bodySent: true,
        idempotencyKeyPresent: false,
      },
      recovery: { idempotent: false, retryAfterSeconds: 0 },
    };
  throw Error("Unknown scenario");
}
