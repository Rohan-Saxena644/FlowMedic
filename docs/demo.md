# Repeatable demo

1. Follow README setup. Confirm `/api/v1/health` reports database, Temporal and model available. Ollama must have the exact `MODEL_ID` installed.
2. Open the workspace and Demo Lab. Trigger **CRM hits the limit**. The returned incident opens automatically. Show the real received/context/classification/tool/diagnosis stages and the model latency.
3. Explain the hypothesis and evidence. Approve **demo retry**. The Temporal workflow waits the bounded backoff, then records a simulated result and audit event. The dashboard recovered count is computed from persisted records.
4. Trigger **A field lost in translation**. Compare expected `email` with received `email_address`. The agent should recommend mapping correction. Retry remains unavailable. No configuration change is claimed. Choose manual resolution or rejection.
5. Trigger **Did that order go through?**. Show body-sent evidence and missing idempotency key. Discuss the unknown remote outcome. Blind retry remains unavailable even if model output would recommend it.
6. To prove durability, leave a fresh incident awaiting approval, stop only the worker process (not Temporal), restart `pnpm --filter @flowmedic/workflows dev`, then approve. The same workflow ID/history continues; database and Temporal volumes preserve state. Record the observed outcome; do not claim this passed without performing it.
7. Create a live integration and copy its secret once. Import `examples/n8n/error-reporter.json`, configure HTTP Header Auth, attach it as another workflow's Error Workflow, and cause a production-triggered failure. Confirm a live incident arrives. Live retries stay manual.

## Useful commands

```sh
pnpm seed
pnpm test
pnpm typecheck
pnpm build
docker compose -f infra/docker-compose.yml logs temporal
```

With PowerShell, use `.cmd` for pnpm. For database integration tests: `$env:RUN_INTEGRATION='1'; pnpm.cmd exec dotenv -e .env -- vitest run tests/integration.test.ts`.

The baseline detects rate limit/schema/timeout categories; the agent adds explanation, evidence references, mapping analysis and missing-information guidance. These conclusions are real generated results and can vary. A missing model yields a visible failed investigation after bounded retries, never a fake result.
