# Submission handoff

Checked against the [challenge](https://dev.to/challenges/hacktoberfest-week2-2026-10-12), [Week 2 rules](https://dev.to/page/hacktoberfest-week2-2026-10-12-contest-rules), and linked submission template on October 18, 2026.

## Deadline and entry

The stated cutoff is **October 18, 2026, 11:59 PM PDT**, equivalent to **October 19, 2026, 12:29 PM IST** (`2026-10-19T06:59:00Z`). Publish before that cutoff with upload buffer.

- [ ] Confirm personal eligibility and review the linked official rules.
- [ ] Use the challenge's submission template and publish one completed DEV post with `devchallenge` and `hf26challenge` tags.
- [ ] Include a deployed-project link **or a video demo**; a video supports this local MVP.
- [ ] Include the repository link and explain the customer, business idea, and open AI contribution.
- [ ] List Gemma, Mastra, and Temporal categories with concrete implementation evidence.
- [ ] Credit any human teammates and non-trivial reused work. Optional agent-session sharing requires checking the export for secrets first.
- [ ] Note any commits after the deadline in README, as the challenge FAQ requires.

Writing has the largest judging weight. Use [the prepared draft](dev-submission.md), replace the required demo placeholder, review its claims, and preview before publishing. A saved draft is not a published entry.

## Finish the assets

- [ ] Record the actual dashboard at readable text size. Keep `.env`, integration secrets and API keys out of the recording.
- [ ] Upload the recording somewhere judges can open without requesting access. Test its link while signed out.
- [ ] Capture real incident-detail screenshots if time permits; screenshots are supplementary to the demo.
- [ ] Confirm the latest commits are pushed and the repository can be read by judges. At the initial check, remote `main` was `ba40175`; local inbox commit `fbcaa66` had not been pushed.
- [x] Update the draft after the real n8n 2.43.7 check: transport, context reads, actual inference and retry blocking passed; retain the model-quality and browser-verification limitations.
- [ ] Publish the DEV post, open its public URL while signed out, and confirm both tags and working demo/code links.

## Suggested recording sequence

Aim for a clear 4–6 minute edit; this is a suggested length, not a contest requirement. Real CPU inference can take a minute per scenario. Label any trimmed waiting period rather than implying instant results.

1. **Customer and problem, 20 seconds.** Explain that an agency operator needs evidence before retrying a client's failed automation.
2. **Actual investigation.** In Demo Lab trigger the rate-limit scenario. Show its new incident, evidence tool snapshots, real generated diagnosis and measured latency. Explain that the source event is simulated.
3. **Human decision.** Approve the demo retry; show the recorded simulated outcome and audit. Call it a simulation explicitly.
4. **Unsafe replay.** Open the schema mismatch and ambiguous-timeout cases. Show both field names in the evidence and explain why the sent order request must be checked before retrying. Do not read an incorrect model claim as fact.
5. **Durability.** If recording worker restart, use the procedure in [demo.md](demo.md), keeping Temporal running. Show that the same incident and run continue. Do not substitute a test-double run for actual inference footage.
6. **Evidence and tradeoffs.** Briefly show the GitHub tests/evaluation reports, acknowledge model mistakes, and explain why the backend owns recovery policy.

The n8n connection is an optional additional clip once verified. The API key grants evidence reads; the separate FlowMedic integration bearer secret authenticates incoming error reports. Follow [n8n.md](n8n.md) for the real transport check.
