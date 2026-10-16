import assert from "node:assert/strict";
import { config } from "../packages/shared/src/config.js";
import { diagnosisSchema } from "../packages/shared/src/index.js";
const base = `http://localhost:${config.PORT}/api/v1`;
async function api(path: string, post = false) {
  const r = await fetch(`${base}/${path}`, {
    method: post ? "POST" : "GET",
    headers: { Authorization: `Bearer ${config.OPERATOR_TOKEN}` },
  });
  const body = await r.json();
  assert.ok(r.ok, `${path}: ${r.status} ${JSON.stringify(body)}`);
  return body;
}
async function waitFor(id: string, status: string) {
  const deadline = Date.now() + 600000;
  while (Date.now() < deadline) {
    const i = await api(`incidents/${id}`);
    if (i.status === status) return i;
    if (i.status === "FAILED") throw Error(`Incident ${id} failed: ${i.error}`);
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw Error(`Timed out waiting for ${id} → ${status}`);
}
for (const [scenario, expected] of [
  ["rate-limit", "RATE_LIMIT"],
  ["schema-mismatch", "PAYLOAD_SCHEMA_MISMATCH"],
  ["ambiguous-timeout", "NETWORK_TIMEOUT"],
]) {
  const { id } = await api(`demo/scenarios/${scenario}`, true);
  console.log(
    `${scenario}: persisted ${id}; waiting for actual model diagnosis…`,
  );
  const i = await waitFor(id, "AWAITING_APPROVAL");
  diagnosisSchema.parse(i.diagnosis);
  assert.equal(i.category, expected);
  assert.ok(i.run?.latencyMs > 0);
  assert.equal(i.evidenceTrace.length, 5);
  console.log(
    `${scenario}: ${i.run.model}, ${i.run.latencyMs}ms; hypothesis: ${i.diagnosis.rootCause}`,
  );
  if (scenario === "rate-limit") {
    assert.equal(i.proposal.eligible, true);
    await api(`incidents/${id}/approve`, true);
    const recovered = await waitFor(id, "RECOVERED");
    assert.equal(recovered.attempt.mode, "demo");
    assert.equal(recovered.attempt.outcome, "SIMULATED_RECOVERY_SUCCEEDED");
    console.log(
      `${scenario}: approved, durable backoff and simulated recovery verified`,
    );
  } else {
    assert.equal(i.proposal.eligible, false);
    const denied = await fetch(`${base}/incidents/${id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.OPERATOR_TOKEN}` },
    });
    assert.equal(denied.status, 409);
    await api(`incidents/${id}/reject`, true);
    await waitFor(id, "REJECTED");
    console.log(
      `${scenario}: unsafe approval blocked; operator rejection persisted`,
    );
  }
}
console.log(
  "PASS: all three scenarios completed real PostgreSQL → Temporal → Mastra/Gemma diagnosis → human decision paths. Only recovery was simulated.",
);
