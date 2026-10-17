# Submission evidence

Open components used in the code: Mastra agent and typed tools, Gemma open-weight model through Ollama's OpenAI-compatible endpoint, Temporal TypeScript workflows, PostgreSQL, Drizzle, Next.js and Fastify.

`packages/ai/src/index.ts` executes five read-only evidence tools; `packages/ai/src/generate.ts` calls Mastra Agent.generate with a native structured-output schema. Validation precedes atomic persistence of the diagnosis, model latency and audit event. There is no hardcoded substitute diagnosis. Gemma inference stays on the configured endpoint. Open weights allow local operation and model substitution, subject to each model's license and practical inference resources. Fixed-evidence 1B and 4B reports retain their failed behavioral probes as well as their successful outputs; these are implementation evidence, not broad accuracy claims.

`packages/workflows/src/workflow.ts` contains the durable workflow, signals and timers. `apps/api/src/ingest.ts` and the unique delivery index implement persisted ingestion and deduplication. `apps/api/src/app.ts` uses an atomic proposal decision update. The demo recovery adapter is explicitly simulated.

Potential category fit: open-source AI infrastructure and a narrow side-hustle SaaS. Competition eligibility, partner categories and submission rules have not been verified; do not claim partner endorsements.

Verified checks are recorded in `docs/verification.md` as they are run. Planned checks are not results. Include a live recording of inference, tool evidence, approval, simulated recovery and worker restart to demonstrate implementation beyond screenshots.
