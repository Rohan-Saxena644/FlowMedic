# Architecture

`apps/api` validates and authorizes requests, normalizes events, persists incidents and schedules Temporal. `apps/web` serves the trusted localhost workspace and forwards operator requests with a server-only credential. `packages/shared` owns schemas, redaction, classification and retry safety. `packages/db` owns Drizzle schema and SQL migrations. `packages/ai` runs typed evidence tools and the Mastra model call. `packages/workflows` contains deterministic workflow code, all I/O in activities, and the worker.

## Data and event flow

Integration secrets are generated with 256 bits of entropy; only SHA-256 hashes persist. Workflow definitions are unique per integration/source ID. Incident deliveries are unique per integration/source execution ID, source event ID or timestamped canonical event fingerprint. Identity-less events receive fresh IDs. Raw credentials are redacted before normalization and persistence.

Investigation runs record model and latency; evidence rows hold named tool snapshots. Recovery proposals hold immutable eligibility, backoff and a single operator decision. Recovery attempts are unique per incident. Audit events are unique per incident/stage, keeping activity retries from duplicating timeline entries. Migrations run under a PostgreSQL advisory lock and transaction.

## Durable lifecycle

RECEIVED → INVESTIGATING → AWAITING_APPROVAL → RECOVERY_RUNNING → RECOVERED.

Rejection moves to REJECTED; manual resolution moves to MANUAL_ACTION_REQUIRED. Exhausted activity failures move to FAILED. The UI shows manual resolution as manual action, not an automated success. The initial deterministic category persists independently from the model's hypothesis.

Ingestion commits first, then starts `investigation-<incident UUID>` with duplicate reuse rejected. The API dispatcher retries unscheduled incidents. A crash after Temporal start but before marking scheduled is safe because the start ID is stable. Activities are retryable with bounded timeouts; model output gets two generation attempts per activity, with at most three activity attempts. Signals only wake the workflow; authoritative decisions are read from PostgreSQL. A conditional SQL update allows exactly one decision; conflicting decisions return 409. The dispatcher redelivers persisted decisions after API or Temporal interruption. Temporal history retains the approval wait across worker restarts.

## Safety

Only the demo idempotent 429 fixture can produce an executable proposal. Schema failures and timeouts are blocked independently from AI output. External operations have no implementation here and cannot execute through the model. Approved simulated recovery uses a unique database claim and transaction, so concurrent requests or activity replay cannot produce duplicate attempts. The actual backoff is a durable Temporal timer.

The web proxy is for a trusted localhost operator, not public authentication. Integration ingestion has distinct secrets. Model and service endpoints come from trusted environment configuration. Incoming execution URLs are display-only HTTP/HTTPS links and never fetched; arbitrary URL tools do not exist. Redaction is heuristic; model prompts are defensive but no prompt-based safeguard is treated as authorization.

## Deliberate tradeoffs

Stored Error Trigger evidence is available in both demo and live ingestion. Optional richer live execution context uses a fixed environment-configured n8n endpoint and integration ID. Its API key stays server-side, redirects are refused, and responses are redacted. Live retries are unavailable until version/permission checks and remote outcome accounting are implemented. A rules-only baseline classifies an error but cannot compare missing fields, explain uncertain side effects or synthesize related evidence; the model provides those explanations without gaining control over recovery.

The n8n client validates source IDs and response identities, bounds response bytes while reading the body, and preserves readable execution evidence when a workflow read fails (and vice versa). Connection diagnostics require operator authentication, accept no request-supplied endpoint, and test only workflow-list access. The UI displays the check's actual timestamp; it does not infer live retry capability.

`packages/ai/src/generate.ts` contains the shared Mastra generation path. The investigation activity supplies persisted tool snapshots and an audit callback; the evaluation CLI supplies fixed fixture snapshots without database writes or recovery. Reports separate automated behavioral probes from the human assessment needed for factual accuracy.

Diagnosis persistence uses a conditional write while the incident is still INVESTIGATING and its diagnosis is absent. The winning diagnosis, model/latency row and completion audit commit together. Overlapping activity completions cannot replace the winner or mix metadata from different results. Simulated recovery similarly claims RECOVERY_RUNNING and commits its status, attempt and audit together; a late completion cannot add a success record to a failed or already-final incident.

The incident inbox applies validated search and filters in PostgreSQL rather than filtering a truncated browser-side list. It returns summary fields in a paginated envelope, with count and rows from one read-only repeatable-read transaction. Newest-first ordering uses the incident UUID to break timestamp ties. Offset pages are live views, so new arrivals may shift rows between requests. Detail evidence is fetched separately. Category metrics aggregate the entire incident history independently of inbox filters.
