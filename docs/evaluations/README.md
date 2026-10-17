# Model behavior evaluations

Run `pnpm ai:evaluate gemma3:1b` or `pnpm ai:evaluate gemma3:4b` after pulling the corresponding Ollama model. This uses the same Mastra generation function as the application with fixed, redacted fixture evidence. It does not create incidents, write investigation rows or execute recovery. The running application's model configuration is unchanged.

Reports retain each actual model output, inference latency, evidence hash and a few automated behavioral checks. Equal evidence hashes identify equal inputs across model runs. A nonzero command exit indicates at least one failed check or generation failure; the report is still saved. Check failure is useful evidence, not a result to hide.

The checks cover the observed backoff delay, both sides of the schema field-name mismatch, and timeout uncertainty/duplicate risk. They cannot establish factual correctness or calibrated accuracy. Manually review the explanation and root-cause hypothesis; schema validity does not prove either. This three-fixture exercise is not a benchmark.

The checked-in `gemma3-1b.json` baseline fails to mention the expected field name in its schema-mismatch fix, despite producing valid structured output. This reproduces the small-model limitation documented during end-to-end testing.

The checked-in `gemma3-4b.json` uses the same evidence hashes. Its schema-mismatch fix names both `email_address` and `email` and describes checking the mapping. Its `MANUAL_VERIFICATION` label fails the probe expecting correction before retry (`AFTER_CORRECTION` or `DO_NOT_RETRY`). This is recorded without relaxing the probe. The deterministic backend blocks that retry regardless of the label.

| Model / local CPU run | Rate-limit latency | Schema-mismatch latency | Timeout latency | Scenarios passing every probe |
| --------------------- | ------------------ | ----------------------- | --------------- | ----------------------------- |
| Gemma 3 1B            | 31,183 ms          | 11,407 ms               | 12,595 ms       | 2 of 3                        |
| Gemma 3 4B            | 83,111 ms          | 48,836 ms               | 56,419 ms       | 2 of 3                        |

These are single observed runs, including any model-loading overhead, not performance benchmarks. The passing counts mask different weaknesses. Manual review also found unsupported configuration wording in the 4B explanation (the provided evidence does not include full retry configuration). These reports establish actual inference and expose problems to fix; they do not justify a general accuracy claim.
