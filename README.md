# FlowMedic

**Your automations break. FlowMedic finds out why.**

An open-source reliability assistant for freelancers and small agencies maintaining n8n workflows. It receives Error Trigger events, persists redacted evidence in PostgreSQL, runs a durable Temporal investigation, and calls Gemma through Mastra to generate a structured diagnosis. The operator decides what happens next.

## Local setup

Requires Node.js 22.13+, pnpm 10 and Docker Desktop (Linux containers). On Windows PowerShell, use `pnpm.cmd` if script execution is disabled.

```sh
pnpm install
pnpm setup
pnpm infra:up
docker compose -f infra/docker-compose.yml exec ollama ollama pull gemma3:4b
pnpm db:migrate
pnpm dev
```

Open http://localhost:3000, then **Open workspace → Demo Lab**. Temporal history is visible at http://localhost:8233. For limited RAM, pull `gemma3:1b` and set `MODEL_ID=gemma3:1b`; smaller models may be slower to produce a valid schema or less accurate. CPU inference can take minutes. Set Ollama's context appropriately if the model cannot fit the evidence and output schema.

To avoid the large official GPU-enabled Ollama image, use `pnpm infra:cpu` instead of `pnpm infra:up`. This optional override uses the community [alpine-docker CPU image](https://hub.docker.com/r/alpine/ollama). Pull its model with `docker compose -f infra/docker-compose.yml -f infra/docker-compose.cpu.yml exec ollama ollama pull gemma3:1b`, then set `MODEL_ID=gemma3:1b` in `.env`. The standard Compose file retains the official Ollama image.

`pnpm demo:verify` exercises all three scenarios using real inference. `pnpm test:durability` checks Temporal worker shutdown and restart with explicit activity test doubles, independent from inference. `pnpm setup` creates `.env` with a random operator token if missing and preserves existing configuration.

`pnpm seed` submits all three scenarios through the running authenticated API. It does not fabricate diagnoses or metrics. `pnpm test`, `pnpm typecheck`, and `pnpm build` verify the source. Integration tests are opt-in: `pnpm exec dotenv -e .env -- vitest run tests/integration.test.ts` with `RUN_INTEGRATION=1` and a migrated database; see [demo instructions](docs/demo.md).

## Configuration

| Variable             | Purpose                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL connection; Compose binds localhost:55432                 |
| `OPERATOR_TOKEN`     | Shared operator bearer secret; server-only                           |
| `TEMPORAL_ADDRESS`   | gRPC endpoint; localhost:7233                                        |
| `TEMPORAL_NAMESPACE` | default                                                              |
| `MODEL_BASE_URL`     | Ollama OpenAI-compatible `/v1` endpoint, or another trusted endpoint |
| `MODEL_ID`           | Exact installed model ID; default gemma3:4b                          |
| `MODEL_API_KEY`      | Provider credential; Ollama accepts the placeholder `ollama`         |
| `API_URL`            | Web server's internal backend URL                                    |
| `APP_ORIGIN`         | Browser mutation Origin allowlist; localhost:3000                    |
| `PORT`               | Backend port; 4000                                                   |

Configuration is validated at backend/worker startup. The model availability check queries `/v1/models`; errors never become a canned AI result. Do not commit `.env`.

## Architecture and stack

```text
n8n Error Workflow → Fastify → PostgreSQL → Temporal worker
                                                ↓
                                typed evidence tools → Mastra → Gemma/Ollama
                                                ↓
Next.js dashboard ← PostgreSQL ← diagnosis + recovery proposal
        ↓
authenticated decision → persisted decision → Temporal signal → safety policy → demo recovery
```

TypeScript pnpm workspace; Next.js App Router, React, Tailwind, shadcn-style Button/Radix, Lucide, TanStack Query and Recharts; Fastify/Zod; Drizzle/PostgreSQL; Mastra; Temporal TypeScript SDK. No Redis or queues beside Temporal.

## Demo and n8n

The incident inbox searches the full persisted history by workflow, failed node, error message or incident ID. Combine status, category and demo/live source filters; search with Enter or **Search**. Pages contain 25 summary rows. Filters and page are retained in the URL when opening an incident and returning to the inbox. The overview's category chart counts all stored incidents.

`GET /api/v1/incidents` returns `{ items, total, page, pageSize, totalPages }`. Optional query parameters are `q` (up to 200 characters), `status`, `category`, `mode` (`demo` or `live`), `page` and `pageSize` (1–100, default 25). Search treats `%`, `_` and backslashes literally. Evidence and diagnosis remain on the incident detail endpoint. Pages sort newest first with an ID tie-breaker; new events can shift later pages between refreshes.

- **Rate limit:** idempotent simulated GET fails with 429 and Retry-After. A human can approve a demo retry after bounded backoff.
- **Schema mismatch:** expected `email`, received `email_address`. Mapping must be corrected and validated by the operator.
- **Ambiguous timeout:** order body was sent; remote outcome unknown. Blind replay stays blocked.

Import [Error Workflow](examples/n8n/error-reporter.json), attach an HTTP Header Auth credential (`Authorization: Bearer <integration secret>`), then choose this workflow in the source workflow settings. Create the integration and copy its secret once in the Integrations screen. Trigger a production execution failure; manual n8n runs do not invoke Error Workflows. Run local n8n as a host process against `http://localhost:4000/api/v1/events/n8n`. The sample Docker hostname requires the backend to be reachable from the n8n container; the default backend is loopback-only, so explicitly configure a trusted local network before using containerized n8n.

Use the new **Check connection** action to verify optional Public API read access. It reports a real check result and timestamp; it does not claim retry permissions. The [n8n walkthrough](docs/n8n.md) includes the deliberate-failure source workflow, credential configuration, and `pnpm n8n:check` for per-resource diagnostics. Context reads preserve partial results and enforce resource IDs, redirect refusal, response schemas, timeouts and a streaming 2 MB byte limit.

## Open-source AI

The investigator uses Mastra `Agent.generate` with a strict Zod schema and Ollama's native JSON-schema-constrained output. Gemma is open-weight and runs locally through Ollama. Because Gemma 3 does not guarantee native tool calling, the orchestrator executes five typed read-only tools before generation. These query stored execution, workflow, failure, related incident and safety evidence; the model reasons over their actual results. Retries reuse persisted evidence snapshots. No successful AI diagnosis is produced without inference. Model latency and evidence tool traces are persisted. Confidence is an uncalibrated model judgment. Native structured output enforces format, not factual accuracy. Fixed-evidence evaluations of both 1B and 4B models are recorded; the 4B fix identified both sides of the field-name mismatch, but its retry-label probe failed. Both models still require review for unsupported causal or configuration claims. The default 4B model also passed all three real application scenarios on the local CPU runtime.

See [Mastra structured output](https://mastra.ai/docs/agents/structured-output), [Mastra tools](https://mastra.ai/docs/agents/tools), [Temporal TypeScript](https://docs.temporal.io/develop/typescript), and [n8n error handling](https://docs.n8n.io/flow-logic/error-handling/). Package APIs are checked against installed type definitions.

Ollama's [structured output documentation](https://docs.ollama.com/capabilities/structured-outputs) describes native schema enforcement through the OpenAI-compatible API. A compact schema is also supplied in the prompt to explain field meanings to the model. Timeout output schemas constrain retry recommendations and preserve uncertainty; backend eligibility remains independent of model output.

`pnpm ai:evaluate gemma3:1b` (or another installed model ID) runs fixed-fixture behavioral probes through the same generator without changing the app's model, creating incidents or executing recovery. It saves actual outputs and timings in [model evaluations](docs/evaluations/README.md). A failed check produces a nonzero exit code and is retained in the report; the 1B baseline exposes an incomplete schema-mapping fix. These checks do not establish calibrated accuracy.

## Security and limitations

This is a **trusted, local, single-operator MVP**. The web server holds an operator credential and its localhost UI acts on behalf of that operator. It has no login/session system and must not be published or bound to a public interface. POST proxy requests require the configured browser Origin. Direct API operator routes require a bearer token; webhook ingestion uses separately hashed per-integration secrets. Read routes never reveal integration hashes or secrets. Rate limiting and a 256 KB event size limit bound ingestion.

Common credentials are recursively redacted, including values embedded in error strings; this is defense in depth, not comprehensive PII detection. Avoid sending sensitive production payloads. Event content is untrusted; the agent cannot mutate workflows or execute recovery. Event URLs are never fetched. Source timestamps without execution/event IDs support canonical fingerprints; without a reliable identity or timestamp every delivery stays separate, intentionally preferring duplicates over lost failures.

The live evidence adapter supports one operator-configured n8n endpoint. Set `N8N_BASE_URL`, `N8N_API_KEY`, and `N8N_INTEGRATION_ID` (the integration created in the UI) to read execution details and workflow metadata through the Public API. Redirects are refused and event-supplied URLs are never fetched. This adapter has not yet been verified against a live instance. Live execution retry is **not enabled**. All live proposals require manual action; verify instance version, Public API capabilities, permissions and safe side effects before adding execution retries. Demo recovery is a transactional simulator and never implies real n8n recovery. No automatic schema mutation, payments, billing, notifications or multi-tenancy.

The dispatcher closes the database-to-Temporal scheduling gap and retries persisted approval delivery. There is no atomic transaction spanning Temporal and PostgreSQL; stable workflow IDs, uniqueness constraints and idempotent activities make repeated delivery safe. AI generation can repeat after an activity crash; the persisted diagnosis wins once committed. Recovery claims are unique per incident.

## Screenshots

Capture the local dashboard and incident investigation after running the demo. Screenshots are not yet committed; no fabricated screenshots or customer metrics are included.

## Roadmap

Verified n8n evidence adapter and version-gated retry capabilities; operator sessions before deployment; finer redaction controls; agency feedback on the proposed $29/month price. See [architecture](docs/architecture.md), [demo](docs/demo.md), [business](docs/business.md), and [submission notes](docs/hacktoberfest.md).

MIT license for FlowMedic source. Model weights and dependencies retain their own licenses.
