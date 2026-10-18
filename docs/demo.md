# Repeatable demo

1. Follow README setup. Confirm `/api/v1/health` reports database, Temporal and model available. Ollama must have the exact `MODEL_ID` installed.
2. Open the workspace and Demo Lab. Trigger **CRM hits the limit**. The returned incident opens automatically. Show the real received/context/classification/tool/diagnosis stages and the model latency.
3. Explain the hypothesis and evidence. Approve **demo retry**. The Temporal workflow waits the bounded backoff, then records a simulated result and audit event. The dashboard recovered count is computed from persisted records.
4. Trigger **A field lost in translation**. Compare expected `email` with received `email_address`. The agent should recommend mapping correction. Retry remains unavailable. No configuration change is claimed. Choose manual resolution or rejection.
5. Trigger **Did that order go through?**. Show body-sent evidence and missing idempotency key. Discuss the unknown remote outcome. Blind retry remains unavailable even if model output would recommend it.
6. To prove durability, leave a fresh incident awaiting approval, stop only the worker process (not Temporal), approve while it is offline, then restart `pnpm --filter @flowmedic/workflows dev`. The same workflow ID/history continues; database and Temporal volumes preserve state. Compare the investigation run ID before and after to confirm inference was not repeated. This sequence passed locally; see `docs/verification.md` for the recorded incident and run IDs.
7. Create a live integration and copy its secret once. Import `examples/n8n/error-reporter.json`, configure HTTP Header Auth, publish it, attach it as another workflow's Error Workflow, publish the source, and cause a production-triggered failure. Confirm a live incident arrives. Live retries stay manual. Both workflows needed publication on the tested n8n 2.43.7 instance.

## Useful commands

Without n8n credentials, steps 1–6 still exercise the complete demo pipeline. In **Incidents**, use **Search** or Enter to search persisted history, combine status/category/source filters, and page through results. Open an incident, then return to verify that its inbox filters and page remain in the URL. **Clear filters** returns to the first unfiltered page. Demo and live events are explicitly separated by the source filter.

```sh
pnpm seed
pnpm test
pnpm typecheck
pnpm build
docker compose -f infra/docker-compose.yml logs temporal
```

With PowerShell, use `.cmd` for pnpm. For database integration tests: `$env:RUN_INTEGRATION='1'; pnpm.cmd exec dotenv -e .env -- vitest run tests/integration.test.ts`.

The baseline detects rate limit/schema/timeout categories; the agent adds explanation, evidence references, mapping analysis and missing-information guidance. These conclusions are real generated results and can vary. A missing model yields a visible failed investigation after bounded retries, never a fake result.

Incident links use `/dashboard?view=incidents&incident=<UUID>` and survive refresh. The timeline includes rejected model responses with redacted validation details. Earlier failed runs remain visible; do not present them as successful investigations. Both model sizes passed the application pipeline, and their fixed-evidence reports are in `docs/evaluations/`. Review their documented factual limitations before recording an accuracy-focused demonstration; automated probe results are not accuracy guarantees.
