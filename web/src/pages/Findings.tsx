import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { api } from "../api";
import { FindingDrawer } from "../components/FindingDrawer";

type Finding = {
  id: string;
  check_id: string;
  resource_arn: string;
  title: string;
  severity: string;
  risk_score: number;
  status: string;
  evidence: Record<string, unknown>;
  first_seen: string;
  last_seen: string;
};

type Account = { id: string; status: string };

const sevConfig: Record<string, {
  badge: string;
  dot: string;
  border: string;
  headerBg: string;
}> = {
  critical: { badge: "bg-red-100 text-red-700",    dot: "bg-red-500",    border: "border-l-red-500",    headerBg: "bg-red-50/40" },
  high:     { badge: "bg-orange-100 text-orange-700", dot: "bg-orange-500", border: "border-l-orange-400", headerBg: "bg-orange-50/40" },
  medium:   { badge: "bg-amber-100 text-amber-700",  dot: "bg-amber-400",  border: "border-l-amber-400",  headerBg: "bg-amber-50/30" },
  low:      { badge: "bg-slate-100 text-slate-600",  dot: "bg-slate-400",  border: "border-l-slate-300",  headerBg: "bg-slate-50/60" },
};

const checkLabels: Record<string, { name: string; desc: string }> = {
  "iam.user.no_mfa":           { name: "MFA not enabled",                  desc: "User can log in without a second factor" },
  "iam.user.inactive_90d":     { name: "Inactive user (90+ days)",         desc: "No console or API activity in 90 days" },
  "iam.access_key.unused_90d": { name: "Unused access key (90+ days)",     desc: "Key exists but hasn't been used recently" },
  "iam.role.unassumed_90d":    { name: "Role not assumed (90+ days)",      desc: "Role has not been assumed in over 90 days" },
  "iam.role.wildcard_action":       { name: "Wildcard action in inline policy",       desc: "Inline policy grants Action: '*'" },
  "iam.role.unused_services_90d":   { name: "Unused granted services (90+ days)",     desc: "Role has permissions to services it never calls" },
};

const sevOrder = ["critical", "high", "medium", "low"];
const statusTabs = ["open", "snoozed", "resolved", "all"] as const;

function shortArn(arn: string): string {
  const parts = arn.split(":");
  return parts[parts.length - 1] ?? arn;
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-red-600 font-bold";
  if (score >= 60) return "text-orange-600 font-semibold";
  if (score >= 40) return "text-amber-600";
  return "text-slate-400";
}

function daysAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function CheckGroup({
  checkId,
  findings,
  onSelect,
  defaultOpen,
}: {
  checkId: string;
  findings: Finding[];
  onSelect: (f: Finding) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const sev = findings[0]?.severity ?? "low";
  const cfg = sevConfig[sev] ?? sevConfig.low;
  const meta = checkLabels[checkId] ?? { name: checkId, desc: "" };

  return (
    <div className={`bg-white rounded-xl border border-slate-200 border-l-[3px] ${cfg.border} overflow-hidden`}>
      {/* Header — white, left border is the only color signal */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
      >
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold ${cfg.badge} flex-shrink-0`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {sev}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-slate-900">{meta.name}</span>
          {meta.desc && <span className="text-xs text-slate-400 ml-2 hidden sm:inline">{meta.desc}</span>}
        </div>
        <span className="text-xs font-medium text-slate-500 tabular-nums flex-shrink-0">
          {findings.length} {findings.length === 1 ? "resource" : "resources"}
        </span>
        <svg
          className={`w-4 h-4 text-slate-300 flex-shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Finding rows */}
      {open && (
        <div className="border-t border-slate-100">
          <div className="flex items-center gap-3 pl-14 pr-5 py-1.5 border-b border-slate-100">
            <span className="flex-1 text-xs font-medium text-slate-400 uppercase tracking-wide">Resource</span>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide w-10 text-right">Score</span>
            <span className="w-3.5" />
          </div>
          <div className="divide-y divide-slate-100">
          {findings.map((f) => (
            <button
              key={f.id}
              onClick={() => onSelect(f)}
              className="w-full flex items-center gap-3 pl-14 pr-5 py-2.5 hover:bg-slate-50 transition-colors group text-left"
            >
              <span
                className="flex-1 text-xs font-mono text-slate-600 truncate group-hover:text-slate-900 transition-colors"
                title={f.resource_arn}
              >
                {shortArn(f.resource_arn)}
              </span>
              <span className={`text-xs font-semibold tabular-nums flex-shrink-0 w-10 text-right ${scoreColor(f.risk_score)}`}>
                {f.risk_score}
              </span>
              <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Findings() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("open");
  const [selected, setSelected] = useState<Finding | null>(null);
  const prevScanStatus = useRef<string | null>(null);

  const q = useQuery({
    queryKey: ["findings", status],
    queryFn: () => api<Finding[]>(`/v1/findings?status=${status}`),
  });

  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<Account[]>("/v1/accounts"),
  });

  const connectedId = accounts.data?.find(a => a.status === "connected")?.id;

  const scanRun = useQuery({
    queryKey: ["scan-run-latest", connectedId],
    queryFn: () => connectedId
      ? api<{ id: string; status: string; started_at: string; finished_at: string | null; error: string | null } | null>(
          `/v1/accounts/${connectedId}/scan-runs/latest`
        )
      : null,
    enabled: !!connectedId,
    refetchInterval: (query) => query.state.data?.status === "running" ? 5000 : false,
  });

  const scanStatus = scanRun.data?.status ?? null;
  const scanStartedAt = scanRun.data?.started_at ? new Date(scanRun.data.started_at) : null;
  const scanStuck = scanStartedAt ? (Date.now() - scanStartedAt.getTime()) > 5 * 60 * 1000 : false;
  const isRunning = scanStatus === "running" && !scanStuck;

  // when scan transitions running → ok, refresh findings
  useEffect(() => {
    if (prevScanStatus.current === "running" && scanStatus === "ok") {
      qc.invalidateQueries({ queryKey: ["findings"] });
    }
    prevScanStatus.current = scanStatus;
  }, [scanStatus, qc]);

  const scan = useMutation({
    mutationFn: (id: string) => api(`/v1/accounts/${id}/scan`, { method: "POST" }),
    onSuccess: () => {
      // start polling scan status immediately
      setTimeout(() => qc.invalidateQueries({ queryKey: ["scan-run-latest"] }), 1000);
    },
  });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "snooze" | "resolve" | "ignore" }) =>
      api(`/v1/findings/${id}/${action}`, {
        method: "POST",
        body: action === "snooze" ? JSON.stringify({ days: 30 }) : JSON.stringify({}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["findings"] }),
  });

  const findings = q.data ?? [];

  const groups = Object.entries(
    findings.reduce<Record<string, Finding[]>>((acc, f) => {
      (acc[f.check_id] ??= []).push(f);
      return acc;
    }, {})
  ).sort(([, a], [, b]) => {
    const sa = sevOrder.indexOf(a[0]?.severity ?? "low");
    const sb = sevOrder.indexOf(b[0]?.severity ?? "low");
    return sa !== sb ? sa - sb : b.length - a.length;
  });

  const criticalHighCount = findings.filter(f => f.severity === "critical" || f.severity === "high").length;
  const mediumCount = findings.filter(f => f.severity === "medium").length;
  const maxScore = findings.length > 0 ? Math.max(...findings.map(f => f.risk_score)) : 0;

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Findings</h1>
            <p className="text-sm text-slate-500 mt-0.5">IAM security issues detected in your AWS account</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ["findings"] })}
              className="flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
              title="Refresh findings"
            >
              <svg className={`w-4 h-4 ${q.isFetching ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            {connectedId && (
              <button
                onClick={() => scan.mutate(connectedId)}
                disabled={scan.isPending || isRunning}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                <svg className={`w-4 h-4 ${isRunning || scan.isPending ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {isRunning ? "Scanning…" : scan.isPending ? "Triggering…" : "Re-scan"}
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        {status === "open" && findings.length > 0 && (
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-3xl font-bold text-slate-900">{findings.length}</div>
              <div className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wide">Total open</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className={`text-3xl font-bold ${criticalHighCount > 0 ? "text-red-600" : "text-slate-400"}`}>{criticalHighCount}</div>
              <div className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wide">Critical / High</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className={`text-3xl font-bold ${mediumCount > 0 ? "text-amber-500" : "text-slate-400"}`}>{mediumCount}</div>
              <div className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wide">Medium</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className={`text-3xl font-bold ${scoreColor(maxScore)}`}>{maxScore}</div>
              <div className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wide">Max risk score</div>
            </div>
          </div>
        )}

        {isRunning && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 text-sm text-indigo-700 flex items-center gap-2">
            <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Scan in progress — collecting IAM data from your AWS account. Findings will update automatically when complete.
          </div>
        )}
        {scanStatus === "error" && scanRun.data?.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            Last scan failed: {scanRun.data.error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 w-fit shadow-sm">
          {statusTabs.map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                status === s ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {q.isLoading && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-sm">Loading…</div>
        )}

        {!q.isLoading && findings.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
            <svg className="w-10 h-10 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-slate-500 text-sm">No {status} findings</p>
          </div>
        )}

        {groups.length > 0 && (
          <div className="space-y-3">
            {groups.map(([checkId, items]) => (
              <CheckGroup
                key={checkId}
                checkId={checkId}
                findings={items}
                onSelect={setSelected}
                defaultOpen={items[0]?.severity === "critical" || items[0]?.severity === "high"}
              />
            ))}
          </div>
        )}
      </div>

      <FindingDrawer
        finding={selected}
        accountId={connectedId ?? null}
        onClose={() => setSelected(null)}
        onAction={(id, action) => act.mutate({ id, action })}
      />
    </>
  );
}
