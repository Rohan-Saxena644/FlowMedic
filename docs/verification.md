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
