import { describe, it, expect } from "vitest";
import {
  normalize,
  classify,
  retryPolicy,
  redact,
  diagnosisSchema,
  assertTransition,
} from "../packages/shared/src/index";
import { fixture } from "../apps/api/src/fixtures";
describe("ingestion identity and validation", () => {
  it("normalizes documented trigger errors without execution metadata", () => {
    const i = normalize({
      workflow: { name: "Trigger fails" },
      trigger: { error: { message: "401 invalid credentials" } },
    });
    expect(i.executionId).toBeNull();
    expect(i.failedNode).toContain("unknown");
  });
  it("rejects events without an error", () =>
    expect(() =>
      normalize({ workflow: { id: "w" }, execution: {} }),
    ).toThrow());
  it("keeps repeated execution delivery stable", () => {
    const f = fixture("rate-limit");
    expect(normalize(f).identity).toBe(normalize(f).identity);
  });
  it("never merges unrelated unidentified events", () => {
    const f = {
      workflow: { id: "w" },
      trigger: { error: { message: "timeout" } },
    };
    expect(normalize(f).identity).not.toBe(normalize(f).identity);
  });
  it("uses canonical fingerprints only when a source timestamp exists", () => {
    const f = {
      timestamp: "2026-10-17T12:00:00Z",
      workflow: { id: "w" },
      trigger: { error: { message: "timeout" } },
    };
    expect(normalize(f).identity).toBe(
      normalize({ ...f, workflow: { id: "w" } }).identity,
    );
  });
  it("redacts nested credentials and embedded bearer values", () => {
    expect(
      JSON.stringify(
        redact({
          headers: { Authorization: "Bearer abc123", cookie: "session=foo" },
          nested: { apiKey: "sensitive" },
          message: "Failed with Bearer secretvalue",
        }),
      ),
    ).not.toMatch(/abc123|session=foo|sensitive|secretvalue/);
  });
});
describe("independent recovery policy", () => {
  it.each([
    ["rate-limit", "RATE_LIMIT"],
    ["schema-mismatch", "PAYLOAD_SCHEMA_MISMATCH"],
    ["ambiguous-timeout", "NETWORK_TIMEOUT"],
  ])("classifies %s", (scenario, expected) =>
    expect(classify(normalize(fixture(scenario)).message)).toBe(expected),
  );
  it("permits only verified demo idempotent rate-limit retries", () => {
    const n = normalize(fixture("rate-limit"));
    expect(retryPolicy(n.message, n.evidence, "demo").eligible).toBe(true);
    expect(retryPolicy(n.message, n.evidence, "live").eligible).toBe(false);
  });
  it("blocks ambiguous timeout even when metadata claims idempotency", () =>
    expect(
      retryPolicy(
        "ETIMEDOUT",
        { recovery: { idempotent: true, retryAfterSeconds: 0 } },
        "demo",
      ).eligible,
    ).toBe(false));
  it("blocks non-idempotent rate-limit recovery", () =>
    expect(
      retryPolicy(
        "HTTP 429",
        { recovery: { idempotent: false, retryAfterSeconds: 0 } },
        "demo",
      ).eligible,
    ).toBe(false));
  it("blocks unchanged schema failures", () =>
    expect(retryPolicy("schema mismatch", {}, "demo").eligible).toBe(false));
  it("rejects invalid model output instead of inventing fallback", () =>
    expect(
      diagnosisSchema.safeParse({ category: "RATE_LIMIT", confidence: 1.2 })
        .success,
    ).toBe(false));
  it("rejects illegal lifecycle transitions", () => {
    expect(() => assertTransition("RECEIVED", "RECOVERED")).toThrow();
    expect(() =>
      assertTransition("AWAITING_APPROVAL", "RECOVERY_RUNNING"),
    ).not.toThrow();
  });
});
