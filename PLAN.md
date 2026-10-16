# FlowMedic implementation

- [x] Workspace, validated configuration, PostgreSQL schema and migrations
- [x] Secured n8n ingestion, redaction, identity and durable scheduling
- [x] Mastra + Gemma investigation with validated evidence and output
- [x] Temporal approval workflow and conservative recovery policy
- [x] Dashboard, incident details, integrations and three demo scenarios
- [x] Tests, build verification, setup and reproducible demo documentation

Next milestones:

- [ ] Evaluate diagnosis accuracy with the default Gemma 4B model; the 1B smoke-test model produces uneven explanations
- [ ] Verify real Error Workflow ingestion and permitted context reads against an n8n instance
- [ ] Add version- and permission-gated live recovery adapter; live retries remain disabled
- [ ] Browser visual QA and screenshots when a browser session is available

Local-first implementation. AI failures stay visible; no fabricated diagnoses. Live recovery stays disabled until instance capabilities and authorization are verified. PostgreSQL and Temporal are required services.
