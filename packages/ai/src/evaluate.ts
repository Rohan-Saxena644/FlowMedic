import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  normalize,
  classify,
  retryPolicy,
  type Diagnosis,
} from "@flowmedic/shared";
import { fixture } from "../../../apps/api/src/fixtures.js";
import { generateInvestigation } from "./generate.js";
import { config } from "../../shared/src/config.js";

const modelId = process.argv[2] ?? config.MODEL_ID;
const models = await fetch(`${config.MODEL_BASE_URL}/models`, {
  headers: { Authorization: `Bearer ${config.MODEL_API_KEY}` },
  signal: AbortSignal.timeout(5000),
});
if (!models.ok)
  throw Error(`Model availability check returned HTTP ${models.status}`);
const available = (await models.json()) as { data: { id: string }[] };
if (!available.data.some((model) => model.id === modelId))
  throw Error(
    `Model ${modelId} is unavailable; pull it before evaluation. The running application configuration is unchanged.`,
  );
function checks(scenario: string, d: Diagnosis) {
  const text = `${d.rootCause} ${d.explanation} ${d.recommendedFix}`;
  if (scenario === "rate-limit")
    return {
      category: d.category === "RATE_LIMIT",
      backoffRecommendation: d.retryRecommendation === "AFTER_BACKOFF",
      actionMentionsWait: /backoff|wait|delay|pause/i.test(d.recommendedFix),
      observedDelayMentioned: /\b5\b|five/i.test(d.recommendedFix),
    };
  if (scenario === "schema-mismatch")
    return {
      category: d.category === "PAYLOAD_SCHEMA_MISMATCH",
      fixIdentifiesExpectedField: /\bemail\b/i.test(d.recommendedFix),
      fixIdentifiesReceivedField: /\bemail_address\b/i.test(d.recommendedFix),
      requiresCorrection:
        d.retryRecommendation === "AFTER_CORRECTION" ||
        d.retryRecommendation === "DO_NOT_RETRY",
    };
  return {
    category: d.category === "NETWORK_TIMEOUT",
    noBlindRetry: ["MANUAL_VERIFICATION", "DO_NOT_RETRY"].includes(
      d.retryRecommendation,
    ),
    uncertainRisk: d.retryRisk !== "LOW",
    missingInformation: d.missingInformation.length > 0,
    duplicateOrRemoteOutcomeWarning:
      /duplicat|remote.*(outcome|status)|whether.*order|order.*(exist|creat)/i.test(
        text,
      ),
  };
}
const results = [];
for (const scenario of ["rate-limit", "schema-mismatch", "ambiguous-timeout"]) {
  const generated = fixture(scenario);
  const raw = {
    ...generated,
    eventId: `evaluation-${scenario}`,
    timestamp: "2026-10-17T12:00:00.000Z",
    execution: { ...generated.execution, id: `evaluation-${scenario}` },
  };
  const event = normalize(raw);
  const evidence = [
    {
      ref: "failure",
      data: {
        message: event.message,
        node: event.failedNode,
        classification: classify(event.message),
      },
    },
    { ref: "execution", data: { incoming: event.evidence } },
    {
      ref: "workflow",
      data: { name: event.workflowName, sourceId: event.workflowId },
    },
    { ref: "related", data: [] },
    { ref: "safety", data: retryPolicy(event.message, event.evidence, "demo") },
  ];
  const evidenceHash = createHash("sha256")
    .update(JSON.stringify(evidence))
    .digest("hex");
  console.log(
    `Evaluating ${modelId}: ${scenario} (actual inference; no incident or recovery is created)…`,
  );
  try {
    const result = await generateInvestigation(
      {
        id: `evaluation-${scenario}`,
        failedNode: event.failedNode,
        workflowName: event.workflowName,
        message: event.message,
        evidence,
      },
      { modelId },
    );
    const rubric = checks(scenario, result.diagnosis);
    results.push({
      scenario,
      evidenceHash,
      ...result,
      checks: rubric,
      allChecksPassed: Object.values(rubric).every(Boolean),
    });
    console.log(
      JSON.stringify({ scenario, latencyMs: result.latencyMs, checks: rubric }),
    );
  } catch (error) {
    results.push({
      scenario,
      evidenceHash,
      error: error instanceof Error ? error.message : "Evaluation failed",
      allChecksPassed: false,
    });
    console.error(`${scenario}: generation or validation failed`);
  }
}
const report = {
  model: modelId,
  evaluatedAt: new Date().toISOString(),
  scope:
    "Direct model evaluation over fixed redacted fixtures. Not a database/Temporal pipeline test or a calibrated accuracy benchmark. Automated checks are limited behavioral probes; human factual review is required.",
  results,
};
const directory = fileURLToPath(
  new URL("../../../docs/evaluations/", import.meta.url),
);
await mkdir(directory, { recursive: true });
const path = `${directory}/${modelId.replace(/[^a-zA-Z0-9_.-]/g, "-")}.json`;
await writeFile(path, JSON.stringify(report, null, 2) + "\n");
console.log(`Saved measured evaluation: ${path}`);
if (results.some((result) => !result.allChecksPassed)) process.exitCode = 1;
