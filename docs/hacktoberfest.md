# Submission evidence

Open components used in the code: Mastra agent and typed tools, Gemma open-weight model through Ollama's OpenAI-compatible endpoint, Temporal TypeScript workflows, PostgreSQL, Drizzle, Next.js and Fastify.

`packages/ai/src/index.ts` is the actual inference path: five read-only evidence tools → Mastra Agent.generate → strict Zod result → reference validation → persisted diagnosis and model latency. There is no hardcoded substitute diagnosis. Gemma inference stays on the configured endpoint. Open weights allow local operation and model substitution, subject to each model's license and practical inference resources.

`packages/workflows/src/workflow.ts` contains the durable workflow, signals and timers. `apps/api/src/ingest.ts` and the unique delivery index implement persisted ingestion and deduplication. `apps/api/src/app.ts` uses an atomic proposal decision update. The demo recovery adapter is explicitly simulated.

Potential category fit: open-source AI infrastructure and a narrow side-hustle SaaS. Competition eligibility, partner categories and submission rules have not been verified; do not claim partner endorsements.

Verified checks are recorded in `docs/verification.md` as they are run. Planned checks are not results. Include a live recording of inference, tool evidence, approval, simulated recovery and worker restart to demonstrate implementation beyond screenshots.
