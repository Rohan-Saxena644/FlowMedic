---
title: "FlowMedic: investigating broken n8n workflows with Gemma, Mastra, and Temporal"
published: false
tags: devchallenge, hf26challenge
---

_This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 2: Side Hustle](https://dev.to/challenges/hacktoberfest-week2-2026-10-12)._

## What I Built

An automation failed halfway through creating an order. Should you retry it?

A timeout tells you that your workflow stopped hearing back. It does not tell you whether the order was created. Retrying without checking could turn a logging problem into a duplicate order.

I built **FlowMedic** for freelancers and small agencies maintaining n8n workflows for clients. It brings failure evidence, an AI investigation, and a human recovery decision into one incident view.

The intended customer manages roughly 5–50 workflows and is responsible for explaining failures and getting them moving again. FlowMedic's job is to help that operator answer three questions: what happened, what should I inspect or correct, and what must be verified before retrying?

The business hypothesis is a **$29/month solo workspace**, with an agency offering to explore after customer interviews. Billing is not implemented, and I have not established paying customers or measured time savings. The next validation step is watching an automation freelancer investigate their own failures with it.

## Demo

**REQUIRED BEFORE PUBLISHING: add a publicly accessible video demo URL here.**

The application runs locally. The recording should show three scenarios through the real PostgreSQL → Temporal → Mastra → Gemma pipeline:

1. **Rate limit:** a simulated CRM request receives HTTP 429 with a five-second Retry-After value. The model investigates the evidence. An operator approves a bounded demo retry, and a labelled simulator records the outcome.
2. **Schema mismatch:** the evidence says the step expects `email` but receives `email_address`. The operator must inspect and correct the mapping; replaying the unchanged workflow is blocked.
3. **Ambiguous timeout:** the order request body was sent, but its remote outcome is unknown. The interface shows the uncertainty and blocks blind retry.

Inference is real in all three scenarios. The source failures and executable recovery are simulations. The distinction is visible in the application.

The incident detail includes the model hypothesis, supporting evidence snapshots, missing information, retry risk, model latency, and an audit timeline. The inbox also searches the full persisted incident history and filters demo and live events separately.

## Code

[FlowMedic on GitHub](https://github.com/Rohan-Saxena644/FlowMedic)

The repository includes setup instructions, importable n8n workflows, test fixtures, and a repeatable demo walkthrough. FlowMedic source is MIT licensed; the model and dependencies retain their own licenses.

## How I Built It

The application is a TypeScript pnpm monorepo with Next.js, Fastify, PostgreSQL/Drizzle, Mastra, Ollama, and Temporal.

A failure delivery is authenticated, redacted, normalized, and persisted. A database uniqueness constraint handles repeated deliveries. A dispatcher schedules an investigation with a stable Temporal workflow ID.

Five typed, read-only evidence tools gather execution details, workflow metadata, failure context, related incidents, and deterministic retry policy. The backend invokes those tools before calling Mastra's agent with their results. This is explicit orchestration; it does not assume that Gemma will perform native function calling.

The agent uses **Gemma 3 4B through local Ollama** to produce a structured diagnosis. Native JSON-schema output and Zod validation constrain the format. Evidence references are checked, and model calls have bounded retries and timeouts. An inference failure stays a failed investigation; there is no canned substitute diagnosis.

The model never authorizes recovery. The backend applies its own policy, and Temporal can wait durably for a human decision. Only the verified demo rate-limit case can execute its simulated recovery. Live retries remain disabled.

One difficult engineering problem was overlapping activity completion. A late result must not replace a committed diagnosis while leaving the earlier model's latency attached to it. Diagnosis, run metadata, and audit now commit together through a conditional database transaction. Recovery outcomes have the same protection against stale completions.

### What I verified—and what I learned

The verification log records **53 passing automated tests**, workspace typechecks, a production build, real model-backed scenario runs, and a worker restart during an approval wait. After restart, the investigation continued with its existing diagnosis and completed one simulated recovery.

I also evaluated Gemma 1B and 4B against the same three fixed evidence inputs. Both passed every automated behavioral probe in two of the three scenarios. The failures differed: 1B's schema-mismatch fix omitted the expected field name; 4B named both fields but failed the retry-recommendation probe. Those failures remain in the checked-in reports.

That exercise exposed an important limitation: a valid schema does not guarantee a factual explanation. Human review also found unsupported configuration wording in a 4B response. I treat the diagnosis as a hypothesis to inspect, with recovery policy enforced independently.

These are small local observations, not an accuracy benchmark. The [verification log](https://github.com/Rohan-Saxena644/FlowMedic/blob/main/docs/verification.md) and [evaluation reports](https://github.com/Rohan-Saxena644/FlowMedic/tree/main/docs/evaluations) preserve the details.

## Why Does Open Innovation Matter?

Workflow logs can contain client information. With Ollama configured locally, FlowMedic can investigate the redacted evidence without sending it to a proprietary model API. The operator controls the model endpoint and can change the installed model through configuration.

Running both model sizes on the same inputs also let me examine a practical tradeoff on my own machine. The larger model took longer in those runs and still made mistakes. I could retain the outputs, inspect the orchestration, and change validation without replacing the product's investigation workflow.

Local inference avoids a required per-request commercial model bill; it does not eliminate hardware, electricity, or maintenance costs. Gemma's weights are open-weight, while Mastra and Temporal provide open-source infrastructure around the investigation. I have not fine-tuned a model or demonstrated offline operation of every dependency.

### Current boundaries

This is a trusted local, single-operator MVP. It has no public login system, billing, or multi-tenancy. Common-secret redaction is not comprehensive PII detection.

The n8n adapter and Error Workflow examples are implemented, but actual instance ingestion and permitted evidence reads remain unverified at the time of this draft. Its HTTP contract tests use labelled test servers. Live n8n recovery is disabled, and browser visual QA remains pending.

<!-- Update the preceding paragraph only after actual n8n/browser verification; retain any remaining limitations. -->

AI coding assistance was used during implementation. The code, tests, model outputs, and verification records are available for review.

## Prize Categories

- **Best Use of Gemma:** Gemma performs the actual evidence-based diagnosis through Ollama; the repository retains real 1B and 4B outputs, including failed probes.
- **Best Use of Mastra:** a Mastra agent generates the structured diagnosis from typed read-only tool results.
- **Best Use of Temporal:** investigations, activity retries, backoff, and the human approval wait run in a durable Temporal workflow, including a verified worker-restart path.
