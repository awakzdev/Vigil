import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

type Account = {
  id: string;
  label: string;
  account_id: string | null;
  status: string;
};

type Finding = {
  id: string;
  severity: string;
  status: string;
  risk_score: number;
  check_id: string;
  title: string;
  resource_arn: string;
  first_seen: string;
};

const severityOrder: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function metricClass(severity: string) {
  if (severity === "critical" || severity === "high") return "border-red-100 bg-red-50 text-red-600";
  if (severity === "medium") return "border-amber-100 bg-amber-50 text-amber-600";
  return "border-zinc-200 bg-zinc-50 text-zinc-600";
}

function shortResource(arn: string) {
  const tail = arn.split(":").pop() ?? arn;
  const [, rest = tail] = tail.split(/\/(.+)/);
  const [name, suffix] = rest.split("#");
  if (!suffix) return name || rest;
  const masked = suffix.length > 12 ? `${suffix.slice(0, 4)}…${suffix.slice(-4)}` : suffix;
  return `${name} · ${masked}`;
}

export default function Dashboard() {
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => api<Account[]>("/v1/accounts") });
  const findings = useQuery({ queryKey: ["dashboard-findings"], queryFn: () => api<Finding[]>("/v1/findings?status=open") });

  const rows = findings.data ?? [];
  const connectedAccounts = accounts.data?.filter((a) => a.status === "connected").length ?? 0;
  const criticalHigh = rows.filter((f) => f.severity === "critical" || f.severity === "high").length;
  const medium = rows.filter((f) => f.severity === "medium").length;
  const low = rows.filter((f) => f.severity === "low").length;
  const topRisks = [...rows]
    .sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9) || b.risk_score - a.risk_score)
    .slice(0, 5);

  const metrics = [
    { label: "Connected accounts", value: connectedAccounts, hint: "AWS accounts onboarded", className: "border-indigo-100 bg-indigo-50 text-indigo-600" },
    { label: "Critical / High", value: criticalHigh, hint: "needs attention first", className: "border-red-100 bg-red-50 text-red-600" },
    { label: "Medium", value: medium, hint: "reduce backlog", className: "border-amber-100 bg-amber-50 text-amber-600" },
    { label: "Low", value: low, hint: "monitor", className: "border-zinc-200 bg-zinc-50 text-zinc-600" },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-8 py-7">
      <div className="mb-7 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Cloud posture overview across connected accounts and open IAM findings.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className={`rounded-2xl border p-5 shadow-sm shadow-zinc-950/[0.03] ${metric.className}`}>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-70">{metric.label}</div>
            <div className="mt-4 text-4xl font-bold tabular-nums tracking-tight">{findings.isLoading || accounts.isLoading ? "…" : metric.value}</div>
            <div className="mt-2 text-sm opacity-75">{metric.hint}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm shadow-zinc-950/[0.04]">
          <div className="border-b border-zinc-100 px-5 py-4">
            <div className="text-sm font-bold text-zinc-950">Top open risks</div>
            <div className="mt-1 text-sm text-zinc-500">Highest priority IAM findings from the current posture scan.</div>
          </div>

          <div className="divide-y divide-zinc-100">
            {findings.isLoading && <div className="px-5 py-10 text-sm text-zinc-400">Loading risks…</div>}
            {!findings.isLoading && topRisks.length === 0 && <div className="px-5 py-10 text-sm text-zinc-400">No open findings yet.</div>}
            {topRisks.map((finding) => (
              <div key={finding.id} className="grid grid-cols-[auto_minmax(0,1fr)_72px] items-center gap-3 px-5 py-4">
                <span className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${metricClass(finding.severity)}`}>
                  {finding.severity}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-zinc-900">{finding.title}</div>
                  <div className="mt-1 truncate text-sm text-zinc-500">{shortResource(finding.resource_arn)}</div>
                </div>
                <div className="text-center">
                  <span className="inline-flex min-w-10 justify-center rounded-full bg-zinc-100 px-2 py-1 text-sm font-bold tabular-nums text-zinc-800">
                    {finding.risk_score}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-950/[0.04]">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">Coverage roadmap</div>
          <div className="mt-4 space-y-3">
            {[
              ["AWS", "Active", "bg-green-50 text-green-700 border-green-100"],
              ["GCP", "Planned", "bg-zinc-50 text-zinc-500 border-zinc-200"],
              ["Azure", "Planned", "bg-zinc-50 text-zinc-500 border-zinc-200"],
              ["Kubernetes", "Planned", "bg-zinc-50 text-zinc-500 border-zinc-200"],
            ].map(([name, status, cls]) => (
              <div key={name} className="flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50/60 px-4 py-3">
                <span className="text-sm font-semibold text-zinc-800">{name}</span>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>{status}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm leading-6 text-zinc-500">
            This page should become the control room: provider coverage, posture trend, scan health, and remediation velocity.
          </p>
        </div>
      </div>
    </div>
  );
}
