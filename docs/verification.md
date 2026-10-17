# Verification log

Verified locally on October 17, 2026:

- pnpm installation completed; lockfile created.
- PostgreSQL migration applied successfully.
- All six application/library packages passed TypeScript checks.
- Next.js 16.4.2 production build completed successfully.
- 20 unit tests passed (normalization, identities, redaction, classification, invalid diagnosis, evidence citations, actionable fixes, timeout uncertainty, safety and lifecycle rules).
- Four database/Temporal integration tests passed. Eight concurrent deliveries produced one incident; competing approve/reject/resolve calls produced one winner and two conflicts; concurrent simulated recovery calls produced one attempt.
- Real Temporal workflow restart test passed: first worker stopped, signal delivered while offline, replacement worker replayed and completed one recovery test double.
- Landing and dashboard URLs returned HTTP 200. Authenticated server proxy returned persisted incident data. Cross-origin mutation returned 403.
- PostgreSQL and Temporal health checks succeeded. Model health correctly returned unavailable before weights were installed.
- The completed model is Gemma 3 1B (`gemma3:1b`, Q4_K_M), running through the CPU Ollama image. Final health returned HTTP 200 with database, Temporal and model available.
- `pnpm demo:verify` passed all three actual PostgreSQL → Temporal → Mastra/Gemma → operator decision paths using native schema-constrained generation. Recovery was simulated; inference was real.
- Actual model-backed approval durability also passed: worker process stopped while incident `f6ff278b-181a-456f-9f49-5df2c5e3af65` awaited approval; the API persisted and signalled approval while the worker was offline; a replacement worker completed one simulated recovery using the original investigation run `8ec5ad46-b669-4a58-8ed2-0671b86b756f` without regenerating its diagnosis.
- Final frontend production build passed after adding incident query-string navigation. The bookmarked incident URL returned HTTP 200. Browser visual/interaction QA remains unavailable.

## Final scenario evidence

| Scenario          | Persisted incident                     | Measured inference latency | Verified result                                                             |
| ----------------- | -------------------------------------- | -------------------------- | --------------------------------------------------------------------------- |
| Rate limit        | `adfa8a7d-1c04-49e0-91f0-fd81f97387b6` | 8,028 ms                   | Authenticated approval, durable backoff, RECOVERED with a simulated outcome |
| Schema mismatch   | `293b09c5-5ec4-414a-afac-032de3dc7e03` | 8,336 ms                   | Retry approval rejected with HTTP 409; operator rejection persisted         |
| Ambiguous timeout | `cfe1df51-d3f2-4eff-9303-787aaf50219e` | 10,796 ms                  | Retry approval rejected with HTTP 409; operator rejection persisted         |

These are individual local observations, not benchmarks or accuracy measurements. Five evidence snapshots and a validated diagnosis were verified for each scenario.

## Observed limitations

Earlier 1B runs copied JSON-schema metadata or omitted execution citations. Native schema output and constrained references fixed those formatting failures; rejected attempts and earlier failed incidents remain visible. The small model still produces uneven explanations, including incorrect causal language and confusing field-name mismatches with data-format problems. Schema validation does not establish factual accuracy. The default Gemma 4B model has not been evaluated; no accuracy claims are made for it. Review model hypotheses against the raw evidence and deterministic recovery policy.

Not yet verified: actual n8n instance connection, live n8n retry (deliberately disabled), browser rendering/screenshots (no browser surface available in this tool session).

The isolated durability test uses activity doubles and does not count as inference evidence; the additional model-backed restart check above uses the actual application. The recovery concurrency test uses a clearly marked test proposal and a simulated adapter. None of these tests establishes live n8n recovery success.

## n8n diagnostics and model evaluation follow-up

- 51 tests passed with database integration tests enabled: 20 core tests, 17 n8n HTTP client contract tests, seven context-assembly tests, and seven PostgreSQL/Temporal API tests.
- All workspace typechecks passed; the frontend production build passed with the new integration check controls.
- The client tests cover denied permissions, redirect refusal, invalid IDs/JSON/resource identities, timeout, byte limits and credential redaction. Context tests verify partial evidence preservation and isolation between configured and unlinked integrations. They use labelled HTTP test servers, not a real n8n instance.
- The actual local web proxy returned HTTP 200 with `DEMO_INTEGRATION` for the demo integration's check. The CLI returned `NOT_CONFIGURED` and a nonzero exit for an unconfigured integration, as intended.
- `pnpm ai:evaluate gemma3:1b` performed real inference over fixed fixture evidence. Rate-limit and timeout probes passed; the schema-mismatch fix omitted the expected `email` field and failed that probe. The full generated report is retained in `docs/evaluations/gemma3-1b.json`.
- The deliberate-failure n8n workflow and real-instance walkthrough are prepared. Actual n8n import, Error Workflow transport and Public API reads remain unverified without an instance and its configured credentials.
- Gemma 4B was downloaded, checksum-verified and evaluated using the same fixture evidence hashes. Its rate-limit and timeout probes passed; its schema fix correctly named both fields but returned `MANUAL_VERIFICATION`, failing the expected correction-label probe. That failure remains in `docs/evaluations/gemma3-4b.json`.
- The local app was restored to the requested `gemma3:4b` default and passed `pnpm demo:verify`: rate-limit incident `4101e1de-b2f3-4ede-826b-f32e8a498983` recovered in the simulated adapter (59,651 ms model latency); schema-mismatch incident `75693d26-55c8-4821-a00b-522955e7fdcb` blocked retry and was rejected (47,651 ms); ambiguous-timeout incident `a7d850c8-8586-41c4-aba8-c824c63b6524` blocked retry and was rejected (54,224 ms). Health returned HTTP 200 with the 4B model available.
- A concurrency regression test submitted eight different test-only diagnoses simultaneously and verified one winning diagnosis, matching model/latency metadata, and one diagnosis audit event. Another test verified that a late recovery activity cannot create a successful attempt or success audit for a failed incident. These database tests do not invoke a model or a live recovery.
- After reloading the worker with atomic persistence, a real Gemma 4B smoke test passed for incident `a9a8f853-7d15-4bb6-8eb0-7ec1a1490e71`: 56,725 ms model latency, approved simulated recovery reached RECOVERED, and exactly one diagnosis audit and one recovery audit were recorded.
