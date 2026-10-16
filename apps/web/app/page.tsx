import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  ShieldCheck,
  Workflow,
  Search,
  GitBranch,
} from "lucide-react";
export default function Landing() {
  return (
    <main className="landing">
      <nav>
        <Link href="/" className="brand">
          <Activity /> FlowMedic<span className="pill">OPEN SOURCE</span>
        </Link>
        <Link href="/dashboard" className="button outline">
          Open workspace <ArrowUpRight size={15} />
        </Link>
      </nav>
      <section className="hero">
        <div className="eyebrow">
          <span className="dot" /> THE ON-CALL PARTNER FOR YOUR AUTOMATIONS
        </div>
        <h1>
          Your automations break.
          <br />
          <span>Find out why.</span>
        </h1>
        <p>
          Turn your clients’ n8n failures into evidence-backed diagnoses and
          safe recovery plans. Built for independent automation experts.
        </p>
        <div className="actions">
          <Link href="/dashboard?view=demo" className="button primary">
            Investigate a failure <ArrowUpRight size={16} />
          </Link>
          <Link href="/dashboard" className="button outline">
            Explore workspace
          </Link>
        </div>
        <div className="hero-foot">
          LOCAL AI. DURABLE INVESTIGATIONS. YOU STAY IN CONTROL.
        </div>
      </section>
      <section className="landing-grid">
        {[
          [
            Search,
            "Evidence before answers",
            "A Mastra investigator reads execution context and uses Gemma through Ollama to explain the likely cause.",
          ],
          [
            GitBranch,
            "Built to finish the job",
            "Temporal preserves investigations and human approval across worker restarts.",
          ],
          [
            ShieldCheck,
            "Recovery with guardrails",
            "Review every action. Ambiguous timeouts and unsafe retries stay in your hands.",
          ],
        ].map(([Icon, title, text]) => {
          const I = Icon as typeof Workflow;
          return (
            <article key={String(title)}>
              <I />
              <h3>{String(title)}</h3>
              <p>{String(text)}</p>
            </article>
          );
        })}
      </section>
      <section className="pricing">
        <div>
          <span className="eyebrow">A SMALL TOOL FOR A VERY REAL PROBLEM</span>
          <h2>
            Less log hunting.
            <br />
            More client work.
          </h2>
        </div>
        <div>
          <h3>
            Agency workspace <span className="pill">PRICING HYPOTHESIS</span>
          </h3>
          <p>
            <strong>$29</strong> / month
          </p>
          <p>
            Proposed pricing for freelancers managing 5–50 workflows.
            Open-source and self-hostable. Billing is not enabled.
          </p>
        </div>
      </section>
      <footer>
        FlowMedic © 2026 <span>Built with Mastra · Gemma · Temporal · n8n</span>
      </footer>
    </main>
  );
}
