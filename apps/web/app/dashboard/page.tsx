"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Activity,
  LayoutDashboard,
  ListFilter,
  Plug,
  FlaskConical,
  ArrowUpRight,
  ArrowLeft,
  Search,
  ChevronRight,
  Check,
  ShieldCheck,
  Clock,
  AlertTriangle,
  RefreshCw,
  Terminal,
  ExternalLink,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from "recharts";
import { Button } from "../../components/ui/button";
type IncidentSummary = {
  id: string;
  workflowName: string;
  failedNode: string;
  message: string;
  status: string;
  category: string;
  mode: string;
  severity: string;
  createdAt: string;
};
type Incident = IncidentSummary & {
  error?: string;
  evidence: unknown;
  diagnosis?: {
    rootCause: string;
    explanation: string;
    recommendedFix: string;
    retryRisk: string;
    retryRecommendation: string;
    confidence: number;
    missingInformation: string[];
    evidenceRefs: string[];
  };
  proposal?: { eligible: boolean; reason: string; decision?: string };
  attempt?: { outcome: string };
  run?: { model: string; latencyMs: number };
  executionUrl?: string;
  evidenceTrace?: { ref: string; data: unknown }[];
};
type Timeline = {
  id: string;
  stage: string;
  detail: string;
  createdAt: string;
};
type IncidentPage = {
  items: IncidentSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
const statuses = [
  "RECEIVED",
  "INVESTIGATING",
  "AWAITING_APPROVAL",
  "RECOVERY_RUNNING",
  "RECOVERED",
  "REJECTED",
  "MANUAL_ACTION_REQUIRED",
  "FAILED",
];
const categories = [
  "AUTHENTICATION_FAILURE",
  "RATE_LIMIT",
  "NETWORK_TIMEOUT",
  "PAYLOAD_SCHEMA_MISMATCH",
  "MISSING_REQUIRED_FIELD",
  "INVALID_CREDENTIALS",
  "UPSTREAM_SERVICE_ERROR",
  "UNKNOWN",
];
async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(
    `/api/${path}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await r.json();
  if (!r.ok) throw Error(data.error?.message ?? `Request failed (${r.status})`);
  return data;
}
const pretty = (s: string) => s.toLowerCase().replaceAll("_", " ");
const time = (s: string) =>
  new Date(s).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
function Badge({ value }: { value: string }) {
  return (
    <span
      className={`badge ${value === "RECOVERED" ? "green" : value === "FAILED" ? "red" : value === "AWAITING_APPROVAL" ? "amber" : ""}`}
    >
      <span />
      {pretty(value)}
    </span>
  );
}
const nav = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "incidents", label: "Incidents", icon: ListFilter },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "demo", label: "Demo Lab", icon: FlaskConical },
];
export default function Page() {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <Suspense fallback={<div className="empty">Loading workspace…</div>}>
        <Dashboard />
      </Suspense>
    </QueryClientProvider>
  );
}
function Dashboard() {
  const router = useRouter();
  const params = useSearchParams();
  const view = nav.some((item) => item.id === params.get("view"))
    ? params.get("view")!
    : "overview";
  const incidentParam = params.get("incident");
  const selected =
    incidentParam &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      incidentParam,
    )
      ? incidentParam
      : undefined;
  const navigate = (nextView: string, id?: string) => {
    const query =
      nextView === view
        ? new URLSearchParams(params.toString())
        : new URLSearchParams();
    query.set("view", nextView);
    query.delete("incident");
    if (id) query.set("incident", id);
    router.push(`/dashboard?${query.toString()}`, { scroll: false });
  };
  const setView = (nextView: string) => navigate(nextView);
  const setSelected = (id: string | undefined) => navigate(view, id);
  const search = params.get("q") ?? "";
  const updateFilters = (changes: Record<string, string>) => {
    const query = new URLSearchParams(params.toString());
    query.set("view", "incidents");
    query.delete("incident");
    query.delete("page");
    for (const [key, value] of Object.entries(changes)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    router.push(`/dashboard?${query.toString()}`, { scroll: false });
  };
  const listQuery = new URLSearchParams({
    pageSize: view === "overview" ? "8" : "25",
  });
  if (view === "incidents") {
    for (const key of ["q", "status", "category", "mode", "page"]) {
      const value = params.get(key);
      if (value) listQuery.set(key, value);
    }
  }
  const list = useQuery({
    queryKey: ["incidents", listQuery.toString()],
    queryFn: () => api<IncidentPage>(`incidents?${listQuery}`),
    enabled: ["overview", "incidents"].includes(view) && !selected,
    refetchInterval: 3000,
  });
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const r = await fetch("/api/health");
      return r.json();
    },
    refetchInterval: 15000,
  });
  const rows = list.data?.items ?? [];
  const metrics = useQuery({
    queryKey: ["metrics"],
    queryFn: () =>
      api<{
        total: number;
        investigating: number;
        awaitingApproval: number;
        recovered: number;
        averageLatencyMs: number | null;
        categories: { category: string; count: number }[];
      }>("metrics"),
    refetchInterval: 3000,
  });
  return (
    <div className="workspace">
      <aside>
        <Link className="brand" href="/">
          <span className="brand-icon">
            <Activity size={21} />
          </span>
          FlowMedic
        </Link>
        <div className="workspace-select">
          <span className="avatar">D</span>
          <div>
            Demo agency<small>Local workspace</small>
          </div>
          <ChevronRight size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                setView(n.id);
              }}
              className={view === n.id ? "active" : ""}
            >
              <n.icon size={18} />
              {n.label}
              {n.id === "incidents" && (
                <span className="count">{metrics.data?.total ?? "—"}</span>
              )}
              {n.id === "demo" && <span className="tiny">3</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-model">
            <span
              className={`dot ${health.data?.model?.available ? "" : "offline"}`}
            />
            <div>
              {health.data?.model?.available
                ? "Local model connected"
                : "Model not connected"}
              <small>Gemma via Ollama</small>
            </div>
          </div>
          <div className="profile">
            <span className="avatar">OP</span>
            <div>
              Local operator<small>Single-operator mode</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main">
        <header>
          <div>
            Workspace <ChevronRight size={12} />{" "}
            <strong>
              {selected
                ? "Incident investigation"
                : nav.find((n) => n.id === view)?.label}
            </strong>
          </div>
          <span className="pill">
            <span className="dot" /> LOCAL DEVELOPMENT
          </span>
        </header>
        <main className="content">
          {selected ? (
            <Detail id={selected} back={() => setSelected(undefined)} />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">YOUR AUTOMATION CONTROL ROOM</div>
                  <h1>
                    {view === "overview"
                      ? "A pulse on your workflows."
                      : view === "incidents"
                        ? "Every failure. One place."
                        : view === "demo"
                          ? "Break something. Learn why."
                          : "Connect your workflows."}
                  </h1>
                  <p>
                    {view === "demo"
                      ? "Three reproducible failures. One real investigation pipeline."
                      : view === "integrations"
                        ? "Bring n8n errors into a workspace built for investigation."
                        : "Investigate failures, understand the evidence, recover with confidence."}
                  </p>
                </div>
                {view !== "demo" && (
                  <Button onClick={() => setView("demo")}>
                    <FlaskConical size={16} /> Open Demo Lab
                  </Button>
                )}
              </div>
              {["overview", "incidents"].includes(view) && list.error && (
                <div className="error">
                  <AlertTriangle size={18} />
                  {list.error.message}
                  <Button variant="outline" onClick={() => list.refetch()}>
                    Retry
                  </Button>
                </div>
              )}
              {view === "overview" && (
                <>
                  <div className="stats">
                    {[
                      [
                        "Total incidents",
                        metrics.data?.total ?? "—",
                        "Persisted failure events",
                      ],
                      [
                        "Investigating",
                        metrics.data?.investigating ?? "—",
                        "Active investigations",
                      ],
                      [
                        "Needs your review",
                        metrics.data?.awaitingApproval ?? "—",
                        "Awaiting a human decision",
                      ],
                      [
                        "Recovered",
                        metrics.data?.recovered ?? "—",
                        "Includes labeled demo recovery",
                      ],
                    ].map(([name, num, description], n) => (
                      <article key={name}>
                        <div>
                          {name}
                          <span className={`stat-icon s${n}`}>
                            <Activity size={16} />
                          </span>
                        </div>
                        <strong>{metrics.isLoading ? "—" : num}</strong>
                        <small>{description}</small>
                      </article>
                    ))}
                  </div>
                  <div className="overview-grid">
                    <section className="panel chart">
                      <div className="panel-heading">
                        <div>
                          <h3>Failure signals</h3>
                          <p>Categories across all persisted incidents</p>
                        </div>
                        <span className="pill">
                          {metrics.data?.averageLatencyMs != null
                            ? `AVG AI ${(metrics.data.averageLatencyMs / 1000).toFixed(1)}s`
                            : "NO LATENCY DATA"}
                        </span>
                      </div>
                      {metrics.error ? (
                        <div className="error">
                          {metrics.error.message}
                          <Button
                            variant="outline"
                            onClick={() => metrics.refetch()}
                          >
                            Retry metrics
                          </Button>
                        </div>
                      ) : metrics.isLoading ? (
                        <div className="empty compact">
                          Loading failure signals…
                        </div>
                      ) : metrics.data?.categories.length ? (
                        <ResponsiveContainer width="100%" height={180}>
                          <BarChart
                            data={metrics.data.categories.map(
                              ({ category, count }) => ({
                                name: pretty(category),
                                count,
                              }),
                            )}
                          >
                            <XAxis
                              dataKey="name"
                              tick={{ fill: "#8a939e", fontSize: 10 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              contentStyle={{
                                background: "#15191f",
                                border: "1px solid #30363f",
                              }}
                            />
                            <Bar
                              dataKey="count"
                              fill="#77d9b4"
                              radius={[4, 4, 0, 0]}
                              maxBarSize={48}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="empty compact">
                          Your first failure will start the story.
                          <small>Trigger a scenario from the Demo Lab.</small>
                        </div>
                      )}
                    </section>
                    <section className="panel safety">
                      <ShieldCheck size={26} />
                      <span className="eyebrow">BUILT-IN PEACE OF MIND</span>
                      <h3>
                        AI investigates.
                        <br />
                        You make the call.
                      </h3>
                      <p>
                        Every retry needs your approval. Side effects and
                        uncertain outcomes stay behind safety checks.
                      </p>
                      <button onClick={() => setView("demo")}>
                        See the safety policy in action{" "}
                        <ArrowUpRight size={15} />
                      </button>
                    </section>
                  </div>
                </>
              )}
              {["overview", "incidents"].includes(view) && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h3>
                        {view === "overview"
                          ? "Recent incidents"
                          : "Incident inbox"}{" "}
                        <span className="count">{list.data?.total ?? "—"}</span>
                      </h3>
                      <p>From failure to a clear next step</p>
                    </div>
                    {view === "incidents" && (
                      <div className="table-controls">
                        <form
                          id="incident-search"
                          key={search}
                          className="incident-search"
                          onSubmit={(event) => {
                            event.preventDefault();
                            updateFilters({
                              q: String(
                                new FormData(event.currentTarget).get("q") ??
                                  "",
                              ).trim(),
                            });
                          }}
                        >
                          <label>
                            <Search size={15} />
                            <input
                              aria-label="Search incidents"
                              placeholder="Workflow, node, error or ID…"
                              name="q"
                              maxLength={200}
                              defaultValue={search}
                            />
                          </label>
                          <Button type="submit" variant="outline">
                            Search
                          </Button>
                        </form>
                        <select
                          aria-label="Filter status"
                          value={params.get("status") ?? ""}
                          onChange={(e) =>
                            updateFilters({ status: e.target.value })
                          }
                        >
                          <option value="">All statuses</option>
                          {statuses.map((s) => (
                            <option key={s} value={s}>
                              {pretty(s)}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label="Filter category"
                          value={params.get("category") ?? ""}
                          onChange={(e) =>
                            updateFilters({ category: e.target.value })
                          }
                        >
                          <option value="">All categories</option>
                          {categories.map((c) => (
                            <option key={c} value={c}>
                              {pretty(c)}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label="Filter source"
                          value={params.get("mode") ?? ""}
                          onChange={(e) =>
                            updateFilters({ mode: e.target.value })
                          }
                        >
                          <option value="">All sources</option>
                          <option value="demo">Demo events</option>
                          <option value="live">Live n8n events</option>
                        </select>
                        <Button
                          variant="outline"
                          type="reset"
                          form="incident-search"
                          onClick={() =>
                            updateFilters({
                              q: "",
                              status: "",
                              category: "",
                              mode: "",
                            })
                          }
                        >
                          Clear filters
                        </Button>
                      </div>
                    )}
                  </div>
                  {list.isLoading ? (
                    <div className="empty">Loading your incident inbox…</div>
                  ) : list.error ? null : (
                    <IncidentTable
                      rows={rows}
                      select={setSelected}
                      filtered={
                        view === "incidents" &&
                        ["q", "status", "category", "mode"].some((key) =>
                          params.get(key),
                        )
                      }
                    />
                  )}
                  {view === "incidents" && list.data && !list.error && (
                    <nav className="pagination" aria-label="Incident pages">
                      <span role="status">
                        {list.data.total
                          ? `${(list.data.page - 1) * list.data.pageSize + 1}–${Math.min(list.data.page * list.data.pageSize, list.data.total)}`
                          : "0"}{" "}
                        of {list.data.total} incidents
                      </span>
                      <div>
                        <Button
                          variant="outline"
                          disabled={list.data.page <= 1 || list.isFetching}
                          onClick={() =>
                            updateFilters({ page: String(list.data!.page - 1) })
                          }
                        >
                          Previous
                        </Button>
                        <span>
                          Page {list.data.page} of {list.data.totalPages}
                        </span>
                        <Button
                          variant="outline"
                          disabled={
                            list.data.page >= list.data.totalPages ||
                            list.isFetching
                          }
                          onClick={() =>
                            updateFilters({ page: String(list.data!.page + 1) })
                          }
                        >
                          Next
                        </Button>
                      </div>
                    </nav>
                  )}
                </section>
              )}
              {view === "demo" && <Demo select={setSelected} />}{" "}
              {view === "integrations" && <Integrations />}
              <div className="workspace-footer">
                <ShieldCheck size={13} /> Evidence-backed investigations.
                Human-approved recovery.<span>FlowMedic / v0.1</span>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
function IncidentTable({
  rows,
  select,
  filtered = false,
}: {
  rows: IncidentSummary[];
  select: (id: string) => void;
  filtered?: boolean;
}) {
  return !rows.length ? (
    <div className="empty">
      <Activity />
      <h3>{filtered ? "No matching incidents" : "No incidents to show"}</h3>
      <p>
        {filtered
          ? "Try another search or clear the filters."
          : "Launch a Demo Lab scenario or connect an n8n Error Workflow."}
      </p>
    </div>
  ) : (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Workflow / incident</th>
            <th>Failure category</th>
            <th>Severity</th>
            <th>Status</th>
            <th>Received</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.id} onClick={() => select(i.id)}>
              <td>
                <button className="workflow-link" onClick={() => select(i.id)}>
                  {i.workflowName}
                </button>
                <small>
                  #{i.id.slice(0, 8)}{" "}
                  <span>
                    ·{" "}
                    {i.mode === "demo"
                      ? "Demo agency / simulated event"
                      : "n8n integration"}
                  </span>
                </small>
              </td>
              <td>
                <span className="category">{pretty(i.category)}</span>
              </td>
              <td>
                <span className="severity">●</span> {i.severity}
              </td>
              <td>
                <Badge value={i.status} />
              </td>
              <td className="muted">{time(i.createdAt)}</td>
              <td>
                <ChevronRight size={15} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Demo({ select }: { select: (id: string) => void }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (scenario: string) =>
      api<{ id: string }>(`demo/scenarios/${scenario}`, {}),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      select(r.id);
    },
  });
  return (
    <>
      <div className="notice">
        <FlaskConical size={18} />
        <div>
          <strong>Simulated failures. Real infrastructure.</strong>
          <p>
            Each scenario persists an event in PostgreSQL, starts Temporal, and
            invokes your configured model. Recovery is explicitly simulated.
          </p>
        </div>
      </div>
      <div className="scenario-grid">
        {[
          {
            id: "rate-limit",
            n: "01",
            label: "THE RETRYABLE ONE",
            name: "CRM hits the limit",
            text: "A contact lookup receives HTTP 429. The upstream quota resets after a short backoff.",
            kind: "RATE LIMIT",
            baseline:
              "A rules engine detects 429. The agent explains the quota evidence and bounded recovery plan.",
          },
          {
            id: "schema-mismatch",
            n: "02",
            label: "THE FIX-FIRST ONE",
            name: "A field lost in translation",
            text: "Your lead payload sends email_address. The CRM expects email. The workflow needs a mapping correction.",
            kind: "SCHEMA MISMATCH",
            baseline:
              "A rules engine sees a schema error. The agent compares expected and received fields.",
          },
          {
            id: "ambiguous-timeout",
            n: "03",
            label: "THE DANGEROUS ONE",
            name: "Did that order go through?",
            text: "An order request times out after the body is sent. Retrying could create a duplicate order.",
            kind: "AMBIGUOUS TIMEOUT",
            baseline:
              "A rules engine detects a timeout. The agent explains the unknown remote outcome and verification needed.",
          },
        ].map((s) => (
          <article className="panel scenario" key={s.id}>
            <div className="scenario-top">
              <span>{s.n}</span>
              <FlaskConical size={23} />
            </div>
            <div className="eyebrow">{s.label}</div>
            <h2>{s.name}</h2>
            <p>{s.text}</p>
            <span className="pill">{s.kind}</span>
            <div className="baseline">{s.baseline}</div>
            <Button disabled={m.isPending} onClick={() => m.mutate(s.id)}>
              {" "}
              {m.isPending ? "Submitting…" : "Trigger failure"}
              <ArrowUpRight size={16} />
            </Button>
          </article>
        ))}
      </div>
      {m.error && <div className="error">{m.error.message}</div>}
    </>
  );
}
function Detail({ id, back }: { id: string; back: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["incident", id],
    queryFn: () => api<Incident>(`incidents/${id}`),
    refetchInterval: 2500,
  });
  const timeline = useQuery({
    queryKey: ["timeline", id],
    queryFn: () => api<Timeline[]>(`incidents/${id}/timeline`),
    refetchInterval: 2500,
  });
  const action = useMutation({
    mutationFn: (a: string) => api(`incidents/${id}/${a}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incident", id] });
      qc.invalidateQueries({ queryKey: ["incidents"] });
    },
  });
  if (q.error)
    return (
      <div className="error">
        {q.error.message}
        <Button onClick={back}>Back</Button>
      </div>
    );
  if (!q.data) return <div className="empty">Loading investigation…</div>;
  const i = q.data,
    d = i.diagnosis;
  const safeUrl =
    i.executionUrl && /^https?:\/\//.test(i.executionUrl)
      ? i.executionUrl
      : undefined;
  return (
    <>
      <button className="back" onClick={back}>
        <ArrowLeft size={14} /> All incidents
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            INCIDENT #{id.slice(0, 8)}{" "}
            <span className="pill">
              {i.mode === "demo" ? "SIMULATED EVENT" : "LIVE EVENT"}
            </span>
          </div>
          <h1>{i.workflowName}</h1>
          <p>
            {i.failedNode} <span>·</span> {time(i.createdAt)}
          </p>
        </div>
        <Badge value={i.status} />
      </div>
      <div className="detail-grid">
        <div>
          <section className="panel diagnosis">
            <div className="panel-heading">
              <h3>
                <Activity size={18} /> AI investigation
              </h3>
              {i.run && (
                <span className="pill">
                  {i.run.model} · {(i.run.latencyMs / 1000).toFixed(1)}s
                </span>
              )}
            </div>
            {d ? (
              <div className="panel-body">
                <div className="eyebrow">ROOT CAUSE HYPOTHESIS</div>
                <h2>{d.rootCause}</h2>
                <p>{d.explanation}</p>
                <div className="diagnosis-meta">
                  <Badge value={i.category} />
                  <span>
                    Agent confidence estimate: {Math.round(d.confidence * 100)}%{" "}
                    <small>(uncalibrated)</small>
                  </span>
                </div>
                <hr />
                <h3>Recommended fix</h3>
                <p>{d.recommendedFix}</p>
                <div className="risk">
                  <ShieldCheck size={19} />
                  <div>
                    <strong>{d.retryRisk} retry risk</strong>
                    <p>{pretty(d.retryRecommendation)}</p>
                  </div>
                </div>
                {d.missingInformation.length > 0 && (
                  <>
                    <h3>Still unknown</h3>
                    <ul>
                      {d.missingInformation.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </>
                )}
                <small>Evidence references: {d.evidenceRefs.join(", ")}</small>
              </div>
            ) : (
              <div className="empty">
                {i.status === "FAILED" ? (
                  <AlertTriangle />
                ) : (
                  <RefreshCw className="spin" />
                )}
                <h3>
                  {i.status === "FAILED"
                    ? "Investigation needs attention"
                    : "Following the evidence…"}
                </h3>
                <p>
                  {i.error ??
                    "Temporal is gathering context and calling the configured open-weight model. This view updates automatically."}
                </p>
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h3>
                <Terminal size={17} /> Failure evidence
              </h3>
              <span className="pill">REDACTED</span>
            </div>
            <div className="panel-body">
              <div className="error-code">{i.message}</div>
              <details>
                <summary>Incoming execution context</summary>
                <pre>{JSON.stringify(i.evidence, null, 2)}</pre>
              </details>
              {i.evidenceTrace?.map((e) => (
                <details key={e.ref}>
                  <summary>Tool evidence / {e.ref}</summary>
                  <pre>{JSON.stringify(e.data, null, 2)}</pre>
                </details>
              ))}
            </div>
          </section>
        </div>
        <div>
          <section className="panel recovery">
            <div className="panel-heading">
              <h3>
                <ShieldCheck size={18} /> Recovery plan
              </h3>
            </div>
            <div className="panel-body">
              <span className="eyebrow">
                {i.mode === "demo"
                  ? "DEMO RECOVERY ADAPTER"
                  : "MANUAL RECOVERY"}
              </span>
              <p>
                {i.proposal?.reason ??
                  "A recovery proposal is prepared after the diagnosis completes."}
              </p>
              {i.proposal &&
                !i.proposal.decision &&
                i.status === "AWAITING_APPROVAL" && (
                  <div className="recovery-actions">
                    <Button
                      disabled={!i.proposal.eligible || action.isPending}
                      onClick={() => action.mutate("approve")}
                    >
                      <Check size={16} /> Approve demo retry
                    </Button>
                    <Button
                      variant="outline"
                      disabled={action.isPending}
                      onClick={() => action.mutate("reject")}
                    >
                      Reject recommendation
                    </Button>
                    <Button
                      variant="outline"
                      disabled={action.isPending}
                      onClick={() => action.mutate("resolve")}
                    >
                      Resolve manually
                    </Button>
                  </div>
                )}
              {i.proposal?.decision && (
                <Badge
                  value={`OPERATOR_${i.proposal.decision.toUpperCase()}`}
                />
              )}{" "}
              {i.attempt && (
                <div className="notice">
                  <Check size={18} />
                  {pretty(i.attempt.outcome)}
                </div>
              )}
              {action.error && (
                <div className="error">{action.error.message}</div>
              )}
              {safeUrl && (
                <a
                  className="text-link"
                  href={safeUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View execution in n8n <ExternalLink size={13} />
                </a>
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h3>
                <Clock size={17} /> Investigation timeline
              </h3>
            </div>
            <div className="timeline">
              {timeline.data?.map((t) => (
                <div className="timeline-item" key={t.id}>
                  <span className="timeline-check">
                    <Check size={11} />
                  </span>
                  <strong>
                    {t.stage.startsWith("ai-validation:")
                      ? "Model response rejected"
                      : pretty(t.stage.replace("tool:", "Evidence / "))}
                  </strong>
                  <p>{t.detail}</p>
                  <small>{time(t.createdAt)}</small>
                </div>
              ))}
              {timeline.error && <p>{timeline.error.message}</p>}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
function IntegrationConnection({
  integration,
}: {
  integration: { id: string; name: string; mode: string };
}) {
  const check = useMutation({
    mutationFn: () =>
      api<{
        configured: boolean;
        readable: boolean;
        code: string;
        reason: string;
        checkedAt: string;
        liveRetryEnabled: boolean;
      }>(`integrations/${integration.id}/check`, {}),
  });
  return (
    <div>
      <div className="integration-row">
        <span className="avatar">
          <Plug size={17} />
        </span>
        <div>
          <strong>{integration.name}</strong>
          <small>{integration.id}</small>
        </div>
        <span className="pill">{integration.mode}</span>
        {integration.mode === "live" && (
          <Button
            variant="outline"
            disabled={check.isPending}
            onClick={() => check.mutate()}
          >
            {check.isPending ? "Checking…" : "Check connection"}
          </Button>
        )}
      </div>
      {check.data && (
        <div className="connection-result" role="status">
          <Badge value={check.data.readable ? "CONNECTED" : check.data.code} />
          <p>{check.data.reason}</p>
          <small>
            Checked {time(check.data.checkedAt)} · Live retry disabled
          </small>
        </div>
      )}
      {check.error && <div className="error">{check.error.message}</div>}
    </div>
  );
}
function Integrations() {
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string>();
  const q = useQuery({
    queryKey: ["integrations"],
    queryFn: () =>
      api<{ id: string; name: string; mode: string }[]>("integrations"),
  });
  const m = useMutation({
    mutationFn: () => api<{ secret: string }>("integrations", { name }),
    onSuccess: (r) => {
      setSecret(r.secret);
      setName("");
      q.refetch();
    },
  });
  return (
    <div className="integration-grid">
      <section className="panel">
        <div className="panel-heading">
          <h3>
            <Plug size={17} /> n8n integrations
          </h3>
        </div>
        <div className="panel-body">
          {q.data?.map((i) => (
            <IntegrationConnection key={i.id} integration={i} />
          ))}
          {q.isLoading && <p>Loading integrations…</p>}
          {q.error && <div className="error">{q.error.message}</div>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              m.mutate();
            }}
          >
            <label htmlFor="integration-name">Integration name</label>
            <input
              id="integration-name"
              required
              maxLength={100}
              placeholder="Acme agency · n8n"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button disabled={m.isPending}>Create integration</Button>
          </form>
          {m.error && <div className="error">{m.error.message}</div>}
          {secret && (
            <div className="secret">
              <strong>Copy this secret now. It is only shown once.</strong>
              <code>{secret}</code>
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(secret);
                }}
              >
                Copy secret
              </Button>
              <button onClick={() => setSecret(undefined)}>Dismiss</button>
            </div>
          )}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h3>Connect n8n</h3>
        </div>
        <div className="panel-body setup">
          <h3>01 / Import the Error Workflow</h3>
          <p>
            Import <code>examples/n8n/error-reporter.json</code> from the
            repository into n8n, then select it as your workflow’s Error
            Workflow.
          </p>
          <h3>02 / Configure the HTTP Request node</h3>
          <p>POST the entire Error Trigger JSON to:</p>
          <code>http://localhost:4000/api/v1/events/n8n</code>
          <p>
            Use this address when n8n runs on the same host. For a container,
            configure a host address reachable from that container. Configure an
            HTTP Header Auth credential:
          </p>
          <code>Authorization: Bearer YOUR_SECRET</code>
          <h3>03 / Trigger a real failure</h3>
          <p>
            Run the source workflow using a production trigger. Failed manual
            runs do not invoke n8n’s Error Workflow. The new incident appears in
            your inbox.
          </p>
          <h3>04 / Verify optional context access</h3>
          <p>
            For richer execution evidence, configure the n8n base URL, a Public
            API key with the minimum available permissions and this integration
            ID in the server environment. Restart the API and worker, then use
            Check connection. This verifies workflow-list access; individual
            execution permissions may differ.
          </p>
          <div className="notice">
            <ShieldCheck size={18} />
            Live retries remain manual until instance capabilities and
            authorization are verified.
          </div>
        </div>
      </section>
    </div>
  );
}
