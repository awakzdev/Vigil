import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import ScanProgressBar from "../components/ScanProgressBar";
import ConfirmDialog from "../components/ConfirmDialog";
import { useTriggeredScan } from "../hooks/useTriggeredScan";

type Account = {
  id: string;
  label: string;
  account_id: string | null;
  status: string;
  external_id: string;
  cfn_launch_url: string;
  last_scan_at: string | null;
};

type Finding = { id: string; account_id: string; severity: string; status: string };

type FindingStats = { critHigh: number; medium: number; open: number };

type PostureTone = "healthy" | "review" | "attention" | "failed" | "setup" | "scanning";

type ScanFreshness = "scanning" | "fresh" | "recent" | "aging" | "stale" | "none";

function AwsIcon({ className = "h-full w-full max-h-16 object-contain" }: { className?: string }) {
  return <img src="/aws.png" alt="AWS" className={className} />;
}

type ControlRow = { status: string };

function useComplianceScore(framework: string, accountId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["controls", framework, accountId],
    queryFn: () =>
      api<ControlRow[]>(
        `/v1/controls?framework=${framework}${accountId ? `&account_id=${accountId}` : ""}`
      ),
    enabled: enabled && !!accountId,
    select: (rows) => {
      const total = rows.length;
      const passed = rows.filter((r) => r.status === "pass").length;
      return total === 0 ? null : Math.round((passed / total) * 100);
    },
  });
}

function averageCompliance(...scores: (number | null | undefined)[]): number | null {
  const valid = scores.filter((s): s is number => s != null);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((sum, s) => sum + s, 0) / valid.length);
}

function formatFrameworkCompliance(
  soc2: number | null | undefined,
  cis: number | null | undefined,
  iso: number | null | undefined
): string | null {
  const parts: string[] = [];
  if (soc2 != null) parts.push(`SOC2 ${soc2}%`);
  if (cis != null) parts.push(`CIS ${cis}%`);
  if (iso != null) parts.push(`ISO ${iso}%`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function scanAgeMs(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Date.now() - d.getTime();
}

function formatLastScan(iso: string | null) {
  const ms = scanAgeMs(iso);
  if (ms == null) return null;
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(iso!).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function scanFreshness(iso: string | null, isScanActive: boolean): ScanFreshness {
  if (isScanActive) return "scanning";
  const ms = scanAgeMs(iso);
  if (ms == null) return "none";
  if (ms < 3_600_000) return "fresh";
  if (ms < 86_400_000) return "recent";
  if (ms < 7 * 86_400_000) return "aging";
  return "stale";
}

const FRESHNESS_META: Record<
  ScanFreshness,
  { dot: string; text: string; hint?: string }
> = {
  scanning: { dot: "bg-indigo-500 animate-pulse", text: "text-indigo-600" },
  fresh: { dot: "bg-emerald-500", text: "text-zinc-600" },
  recent: { dot: "bg-emerald-400", text: "text-zinc-600" },
  aging: { dot: "bg-amber-400", text: "text-zinc-600", hint: "consider rescanning" },
  stale: { dot: "bg-red-400", text: "text-zinc-600", hint: "outdated" },
  none: { dot: "bg-zinc-300", text: "text-zinc-500" },
};

function derivePosture(
  connected: boolean,
  scanFailed: boolean,
  isScanActive: boolean,
  stats: FindingStats | undefined
): { tone: PostureTone; label: string; detail: string } {
  if (!connected) {
    return { tone: "setup", label: "Setup needed", detail: "Deploy the read-only CloudFormation stack" };
  }
  if (isScanActive) {
    return { tone: "scanning", label: "Scanning", detail: "Collecting evidence from AWS" };
  }
  if (scanFailed) {
    return { tone: "failed", label: "Scan failed", detail: "Last scan did not complete — expand for details" };
  }
  if (!stats) {
    return { tone: "setup", label: "Awaiting scan", detail: "Run a scan to assess security posture" };
  }
  if (stats.critHigh > 0) {
    return {
      tone: "attention",
      label: "Needs attention",
      detail: `${stats.critHigh} critical or high finding${stats.critHigh === 1 ? "" : "s"}`,
    };
  }
  if (stats.medium > 0) {
    return {
      tone: "review",
      label: "Review recommended",
      detail: `${stats.medium} medium-severity finding${stats.medium === 1 ? "" : "s"}`,
    };
  }
  return { tone: "healthy", label: "Healthy", detail: "No open critical or high findings" };
}

const POSTURE_STYLES: Record<PostureTone, string> = {
  healthy: "bg-emerald-50 text-emerald-800 ring-emerald-200/80",
  review: "bg-amber-50 text-amber-800 ring-amber-200/80",
  attention: "bg-orange-50 text-orange-800 ring-orange-200/80",
  failed: "bg-red-50 text-red-800 ring-red-200/80",
  setup: "bg-zinc-100 text-zinc-700 ring-zinc-200/80",
  scanning: "bg-indigo-50 text-indigo-800 ring-indigo-200/80",
};

function shortExternalId(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function CopyableExternalId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const display = shortExternalId(value);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Copied!" : value}
      className={`inline-block text-left font-mono text-xs underline decoration-indigo-200 underline-offset-2 transition-colors hover:text-indigo-700 ${
        copied ? "text-emerald-600 decoration-emerald-200" : "text-indigo-600"
      }`}
      style={{ width: `${Math.max(display.length, 6)}ch` }}
    >
      {copied ? "Copied" : display}
    </button>
  );
}

const cardClass =
  "overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_12px_rgba(0,0,0,0.04)] transition-[box-shadow,border-color] duration-200 hover:border-zinc-300 hover:shadow-[0_2px_8px_rgba(0,0,0,0.07),0_8px_20px_rgba(0,0,0,0.05)]";

const expandBtn =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200/70 bg-white text-zinc-500 shadow-sm transition-all duration-200 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-700 hover:shadow active:scale-[0.98] disabled:opacity-50";

const secondaryBtn =
  "inline-flex items-center rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50";

const metaActionBtn =
  "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100/80 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50";

function MetadataField({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-start gap-1.5">
      <span className="mt-px shrink-0 text-zinc-400">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">{label}</p>
        <div className="mt-0.5 text-xs leading-snug text-zinc-700">{children}</div>
      </div>
    </div>
  );
}

function buildStatsMap(items: Finding[] | undefined): Map<string, FindingStats> {
  const map = new Map<string, FindingStats>();
  for (const f of items ?? []) {
    const cur = map.get(f.account_id) ?? { critHigh: 0, medium: 0, open: 0 };
    cur.open += 1;
    if (f.severity === "critical" || f.severity === "high") cur.critHigh += 1;
    if (f.severity === "medium") cur.medium += 1;
    map.set(f.account_id, cur);
  }
  return map;
}

function complianceRingColor(score: number): { arc: string; text: string } {
  if (score >= 80) return { arc: "text-emerald-500", text: "text-emerald-700" };
  if (score >= 40) return { arc: "text-amber-400", text: "text-amber-700" };
  return { arc: "text-orange-500", text: "text-orange-600" };
}

function ComplianceRing({ score }: { score: number | null }) {
  const size = 58;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  if (score == null) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <div
          className="flex items-center justify-center rounded-full border border-dashed border-zinc-200/80 bg-zinc-50/50"
          style={{ width: size, height: size }}
        >
          <span className="text-xs font-medium text-zinc-300">—</span>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Compliance</span>
      </div>
    );
  }

  const colors = complianceRingColor(score);
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-zinc-200/80"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={colors.arc}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span className={`text-sm font-semibold tabular-nums leading-none ${colors.text}`}>
            {score}%
          </span>
        </div>
      </div>
      <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Compliance</span>
    </div>
  );
}

const sectionDivider = "border-zinc-100/50";

function PostureMetric({
  value,
  label,
  accent,
}: {
  value: number;
  label: string;
  accent?: "critical" | "default";
}) {
  return (
    <div className="flex min-w-[2.5rem] flex-col items-center gap-1">
      <span
        className={`text-lg font-semibold tabular-nums leading-none ${
          accent === "critical" && value > 0 ? "text-orange-600" : "text-zinc-800"
        }`}
      >
        {value}
      </span>
      <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">{label}</span>
    </div>
  );
}

function FindingsMetricsPanel({ stats }: { stats: FindingStats }) {
  const metrics: {
    value: number;
    label: string;
    accent?: "critical" | "default";
  }[] = [
    { value: stats.critHigh, label: "Critical", accent: "critical" },
    { value: stats.medium, label: "Medium" },
    { value: stats.open, label: "Open" },
  ];

  return (
    <>
      <div className="hidden sm:grid sm:grid-cols-3 sm:gap-x-2">
        {metrics.map((m) => (
          <span
            key={m.label}
            className={`text-center text-lg font-semibold tabular-nums leading-none transition-colors ${
              m.accent === "critical" && m.value > 0 ? "text-orange-600" : "text-zinc-800"
            }`}
          >
            {m.value}
          </span>
        ))}
        {metrics.map((m) => (
          <span
            key={`${m.label}-label`}
            className="mt-1 text-center text-[10px] font-medium uppercase tracking-wider text-zinc-400"
          >
            {m.label}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 sm:hidden">
        <PostureMetric value={stats.critHigh} label="Crit" accent="critical" />
        <PostureMetric value={stats.medium} label="Med" />
        <PostureMetric value={stats.open} label="Open" />
      </div>
    </>
  );
}

function ScanFreshnessBadge({
  iso,
  isScanActive,
}: {
  iso: string | null;
  isScanActive: boolean;
}) {
  const freshness = scanFreshness(iso, isScanActive);
  const meta = FRESHNESS_META[freshness];
  const ago = formatLastScan(iso);

  if (freshness === "scanning") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-indigo-600">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
        <span className="font-medium">Scan in progress</span>
      </div>
    );
  }

  if (freshness === "none") {
    return (
      <div className={`flex items-center gap-1.5 text-xs ${meta.text}`}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
        <span>No scan yet</span>
      </div>
    );
  }

  if (freshness === "fresh" || freshness === "recent") {
    return (
      <div className={`flex items-center gap-1.5 text-xs ${meta.text}`}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
        <span className="font-medium text-emerald-700">Fresh scan</span>
        {ago && <span className="text-zinc-400">· {ago}</span>}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 text-xs ${meta.text}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
      <span className="font-medium text-amber-700">Scan outdated</span>
      {ago && <span className="text-zinc-400">· {ago}</span>}
      {meta.hint && <span className="text-zinc-400">· {meta.hint}</span>}
    </div>
  );
}

function AccountCard({
  acc,
  stats,
  expanded,
  onToggle,
}: {
  acc: Account;
  stats: FindingStats | undefined;
  expanded: boolean;
  onToggle: () => void;
}) {
  const qc = useQueryClient();
  const [roleArn, setRoleArn] = useState("");
  const [showUpdateArn, setShowUpdateArn] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const connected = acc.status === "connected";
  const hasScanned = connected && !!acc.last_scan_at;

  const {
    scanRun,
    scanStatus,
    isRunning,
    isScanActive,
    scanProgress,
    triggerScan,
  } = useTriggeredScan(connected ? acc.id : undefined, {
    backgroundPollMs: 5000,
    onScanComplete: () => {
      qc.invalidateQueries({ queryKey: ["findings-snapshot-all"] });
      qc.invalidateQueries({ queryKey: ["controls"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
  });

  const verify = useMutation({
    mutationFn: () =>
      api<Account>(`/v1/accounts/${acc.id}/verify`, {
        method: "POST",
        body: JSON.stringify({ role_arn: roleArn }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setShowUpdateArn(false);
      setRoleArn("");
    },
  });

  const soc2 = useComplianceScore("soc2", acc.id, connected && hasScanned);
  const cis = useComplianceScore("cis_aws_l1", acc.id, connected && hasScanned);
  const iso = useComplianceScore("iso27001", acc.id, connected && hasScanned);

  const remove = useMutation({
    mutationFn: () => api(`/v1/accounts/${acc.id}`, { method: "DELETE" }),
    onSuccess: () => {
      setShowRemoveConfirm(false);
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
  });

  const scanFailed = scanStatus === "error";
  const posture = derivePosture(connected, scanFailed, isScanActive, hasScanned ? stats : undefined);
  const hasStats = connected && hasScanned && !!stats;
  const complianceAvg = averageCompliance(soc2.data, cis.data, iso.data);
  const complianceDetail = formatFrameworkCompliance(soc2.data, cis.data, iso.data);

  return (
    <div
      className={`group ${cardClass} ${!connected ? "border-l-[3px] border-l-amber-400" : ""} ${
        expanded ? "ring-2 ring-indigo-500/10" : ""
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-stretch">
        {/* LEFT — identity + compliance posture */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 px-3 py-2.5 sm:flex-row sm:items-stretch lg:py-3 lg:pl-3 lg:pr-3">
          <div className="flex min-w-0 flex-1 items-stretch gap-4">
            <div className="w-[4.25rem] shrink-0 self-stretch">
              <div className="flex h-full min-h-[4.75rem] w-full items-center justify-center rounded-lg border border-orange-200/50 bg-[#FF9900]/[0.06] p-2.5">
                <AwsIcon className="h-full w-full max-h-14 object-contain" />
              </div>
            </div>
            <div className="min-w-0 flex-1 self-center py-0.5 pl-0.5">
              <span
                className={`inline-flex items-center rounded-md px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${POSTURE_STYLES[posture.tone]}`}
              >
                {posture.label}
              </span>
              <h2 className="mt-1 truncate text-base font-semibold leading-tight tracking-tight text-zinc-900">
                {acc.label}
              </h2>
              {acc.account_id && (
                <p className="mt-0.5 font-mono text-[11px] tabular-nums text-zinc-500">{acc.account_id}</p>
              )}
              {connected ? (
                <div className="mt-1">
                  <ScanFreshnessBadge iso={acc.last_scan_at} isScanActive={isScanActive} />
                </div>
              ) : (
                <p className="mt-1 text-[11px] leading-snug text-zinc-500">{posture.detail}</p>
              )}
            </div>
          </div>
          {connected && hasScanned && (
            <div
              className={`flex shrink-0 items-center justify-center border-t pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4 ${sectionDivider}`}
            >
              <ComplianceRing score={complianceAvg ?? null} />
            </div>
          )}
        </div>

        {/* RIGHT — findings + actions */}
        <div
          className={`flex shrink-0 items-center gap-2.5 border-t px-3 py-2.5 lg:border-t-0 lg:border-l lg:py-3 lg:pl-3 lg:pr-3 ${sectionDivider}`}
        >
          {hasStats && stats && (
            <div className="rounded-lg bg-zinc-50/80 px-1.5 py-1.5 ring-1 ring-inset ring-zinc-100/60 transition-colors group-hover:bg-zinc-50">
              <FindingsMetricsPanel stats={stats} />
            </div>
          )}
          {connected && (
            <button
              onClick={() => triggerScan(acc.id)}
              disabled={isScanActive}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-500 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg
                className={`h-3.5 w-3.5 ${isScanActive ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {isScanActive ? (isRunning ? "Scanning…" : "Starting…") : "Scan"}
            </button>
          )}
          <button
            type="button"
            onClick={onToggle}
            disabled={isScanActive}
            className={`${expandBtn} ${expanded ? "bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200/80" : ""}`}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse details" : "Expand details"}
          >
            <svg
              className={`h-4 w-4 transition-transform duration-200 ease-out ${expanded ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {connected && isScanActive && (
        <div className="border-t border-zinc-100 px-4 pb-3 pt-2">
          <ScanProgressBar
            phase={isRunning ? "running" : "starting"}
            progress={scanProgress.progress}
            elapsedMs={scanProgress.elapsedMs}
            remainingMs={scanProgress.remainingMs}
            finishing={scanProgress.finishing}
            indeterminate={scanProgress.indeterminate}
          />
        </div>
      )}

      {connected && !hasScanned && !isScanActive && (
        <div className="border-t border-zinc-100 bg-zinc-50/50 px-4 py-3 text-center text-xs text-zinc-500">
          Run a scan to populate findings and compliance scores.
        </div>
      )}

      {expanded && (
        <div className="border-t border-zinc-100/70 px-3 py-2 text-xs">
          {!connected ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  {
                    n: 1,
                    title: "Deploy role",
                    body: (
                      <a
                        href={acc.cfn_launch_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        Launch stack
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    ),
                  },
                  { n: 2, title: "Copy RoleArn", body: <p className="mt-1 text-zinc-500">From stack Outputs tab</p> },
                  { n: 3, title: "Verify", body: <p className="mt-1 text-zinc-500">Paste RoleArn below</p> },
                ].map(({ n, title, body }) => (
                  <div key={n} className="rounded-lg border border-zinc-200 bg-white p-3">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-[10px] font-medium text-zinc-500">
                      {n}
                    </div>
                    <div className="mt-2 text-sm font-medium text-zinc-900">{title}</div>
                    {body}
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-500">
                External ID: <CopyableExternalId value={acc.external_id} />
              </p>
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="arn:aws:iam::123456789012:role/VigilReadOnly"
                  value={roleArn}
                  onChange={(e) => setRoleArn(e.target.value)}
                />
                <button
                  onClick={() => verify.mutate()}
                  disabled={verify.isPending || !roleArn}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {verify.isPending ? "Verifying…" : "Verify"}
                </button>
              </div>
              {verify.error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
                  {(verify.error as Error).message}
                </div>
              )}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setShowRemoveConfirm(true)}
                  disabled={remove.isPending}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-red-50 hover:text-red-600"
                >
                  Remove account
                </button>
              </div>
            </div>
          ) : (
            <div className={scanStatus === "error" && scanRun.data?.error ? "space-y-2" : ""}>
              {scanStatus === "error" && scanRun.data?.error && (
                <div className="mb-2 rounded-md border border-red-200/80 bg-red-50/80 px-2.5 py-1.5 text-red-700">
                  <span className="font-medium">Last scan failed</span>
                  {scanRun.data.error_type && <> ({scanRun.data.error_type})</>}
                  <div className="mt-0.5 line-clamp-2 break-words">{scanRun.data.error}</div>
                </div>
              )}

              {showUpdateArn ? (
                <div className="space-y-2">
                  <p className="text-zinc-600">
                    Paste the new RoleArn from stack Outputs. External ID:{" "}
                    <CopyableExternalId value={acc.external_id} />.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="arn:aws:iam::123456789012:role/VigilReadOnly"
                      value={roleArn}
                      onChange={(e) => setRoleArn(e.target.value)}
                    />
                    <button
                      onClick={() => verify.mutate()}
                      disabled={verify.isPending || !roleArn}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {verify.isPending ? "Verifying…" : "Verify"}
                    </button>
                    <button
                      onClick={() => {
                        setShowUpdateArn(false);
                        setRoleArn("");
                        verify.reset();
                      }}
                      className="rounded-md px-2.5 py-1.5 text-zinc-400 hover:text-zinc-600"
                    >
                      Cancel
                    </button>
                  </div>
                  {verify.isSuccess && <p className="text-emerald-600">Role ARN updated.</p>}
                  {verify.error && (
                    <div className="rounded-md border border-red-200/80 bg-red-50/80 px-2.5 py-1.5 text-red-700">
                      {(verify.error as Error).message}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="flex items-start gap-3">
                    <MetadataField
                      icon={
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                      }
                      label="External ID"
                    >
                      <CopyableExternalId value={acc.external_id} />
                    </MetadataField>

                    {hasScanned && (
                      <MetadataField
                        icon={
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                          </svg>
                        }
                        label="Compliance"
                      >
                        <span className="tabular-nums text-zinc-600">
                          {complianceDetail ?? "—"}
                        </span>
                      </MetadataField>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1 sm:ml-auto">
                    <button
                      type="button"
                      onClick={() => setShowUpdateArn(true)}
                      disabled={isScanActive}
                      className={metaActionBtn}
                    >
                      Update IAM role
                    </button>
                    <span className="text-zinc-200" aria-hidden>
                      ·
                    </span>
                    <a
                      href={acc.cfn_launch_url}
                      target="_blank"
                      rel="noreferrer"
                      className={metaActionBtn}
                    >
                      Re-deploy stack
                    </a>
                    <span className="text-zinc-200" aria-hidden>
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowRemoveConfirm(true)}
                      disabled={remove.isPending}
                      className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-zinc-400 transition hover:bg-red-50/80 hover:text-red-600"
                    >
                      {remove.isPending ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={showRemoveConfirm}
        title="Remove this account?"
        description={
          connected
            ? hasScanned
              ? `${acc.label} and all associated findings, scan history, and evidence will be permanently deleted. This cannot be undone.`
              : `${acc.label} will be disconnected and removed. No findings or evidence have been collected yet. This cannot be undone.`
            : `${acc.label} setup will be discarded. This account was never connected — no findings, scans, or evidence exist. This cannot be undone.`
        }
        confirmLabel="Remove account"
        variant="danger"
        loading={remove.isPending}
        onCancel={() => !remove.isPending && setShowRemoveConfirm(false)}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

function PostureSummary({
  accounts,
  statsMap,
}: {
  accounts: Account[];
  statsMap: Map<string, FindingStats>;
}) {
  const connected = accounts.filter((a) => a.status === "connected");
  let totalOpen = 0;
  let totalCrit = 0;
  let needsAttention = 0;
  for (const a of connected) {
    const s = statsMap.get(a.id);
    if (!s) continue;
    totalOpen += s.open;
    totalCrit += s.critHigh;
    if (s.critHigh > 0) needsAttention += 1;
  }

  const tiles: {
    label: string;
    value: number;
    accent?: "warning" | "risk";
    icon?: React.ReactNode;
    gradient: string;
  }[] = [
    {
      label: "Connected",
      value: connected.length,
      gradient: "from-white to-sky-50/40",
    },
    {
      label: "Open findings",
      value: totalOpen,
      gradient: "from-white to-zinc-50/90",
    },
    {
      label: "Critical + high",
      value: totalCrit,
      accent: totalCrit > 0 ? "warning" : undefined,
      gradient: totalCrit > 0 ? "from-orange-50/50 to-orange-50/20" : "from-white to-zinc-50/90",
      icon: (
        <svg className={`h-3.5 w-3.5 ${totalCrit > 0 ? "text-orange-500" : "text-zinc-400"}`} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    {
      label: "Accounts at risk",
      value: needsAttention,
      accent: needsAttention > 0 ? "risk" : undefined,
      gradient: needsAttention > 0 ? "from-orange-50/60 to-amber-50/30" : "from-white to-zinc-50/90",
      icon: (
        <svg className={`h-3.5 w-3.5 ${needsAttention > 0 ? "text-orange-500" : "text-zinc-400"}`} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <div
          key={t.label}
          className={`rounded-xl border bg-gradient-to-br px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[box-shadow,border-color] duration-200 hover:border-zinc-300 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] ${t.gradient} ${
            t.accent === "warning"
              ? "border-orange-200/80 ring-1 ring-orange-100/80"
              : t.accent === "risk"
                ? "border-orange-300/70 ring-1 ring-orange-200/60"
                : "border-zinc-200"
          }`}
        >
          <div className="flex items-center gap-1.5">
            {t.icon}
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${t.accent ? "text-orange-600/80" : "text-zinc-400"}`}>
              {t.label}
            </p>
          </div>
          <p
            className={`mt-1 text-2xl font-semibold tabular-nums ${
              t.accent ? "text-orange-600" : "text-zinc-900"
            }`}
          >
            {t.value}
          </p>
          {t.accent === "risk" && t.value > 0 && (
            <p className="mt-0.5 text-[10px] font-medium text-orange-600/70">Review recommended</p>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Accounts() {
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<Account[]>("/v1/accounts"),
  });

  const create = useMutation({
    mutationFn: () => api<Account>("/v1/accounts", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: (acc) => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setExpandedId(acc.id);
    },
  });

  const allFindings = useQuery({
    queryKey: ["findings-snapshot-all"],
    queryFn: () =>
      api<{ items: Finding[]; total: number; next_cursor: string | null }>(
        `/v1/findings?status=open&limit=500`
      ),
    enabled: (accounts.data?.length ?? 0) > 0,
  });

  const statsMap = useMemo(() => buildStatsMap(allFindings.data?.items), [allFindings.data?.items]);

  const accs = accounts.data ?? [];
  const hasPending = accs.some((a) => a.status !== "connected");
  const didAutoExpand = useRef(false);

  useEffect(() => {
    if (!didAutoExpand.current && accs.length === 1) {
      setExpandedId(accs[0].id);
      didAutoExpand.current = true;
    }
  }, [accs]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950">AWS Accounts</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Connected accounts, scan freshness, and security posture at a glance.
          </p>
        </div>
        {accs.length > 0 && (
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending || hasPending}
            title={hasPending ? "Finish setting up the pending account first" : undefined}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {create.isPending ? "Adding…" : "Add account"}
          </button>
        )}
      </div>

      {accs.length > 0 && <PostureSummary accounts={accs} statsMap={statsMap} />}

      {accs.length === 0 && !accounts.isLoading && (
        <div className={`${cardClass} max-w-xl p-8`}>
          <div className="flex h-11 w-14 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 px-1.5">
            <AwsIcon />
          </div>
          <h2 className="mt-5 text-lg font-semibold tracking-tight text-zinc-900">Connect your first AWS account</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
            Deploy a read-only IAM role via CloudFormation. Vigil scans daily and maps findings to SOC 2 and CIS controls.
          </p>
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="mt-6 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {create.isPending ? "Setting up…" : "Connect account"}
          </button>
        </div>
      )}

      {accs.length > 0 && (
        <div className="space-y-4">
          {accs.map((acc) => (
            <AccountCard
              key={acc.id}
              acc={acc}
              stats={statsMap.get(acc.id)}
              expanded={expandedId === acc.id}
              onToggle={() => setExpandedId((id) => (id === acc.id ? null : acc.id))}
            />
          ))}
        </div>
      )}

      {hasPending && accs.length > 0 && (
        <p className="text-center text-xs text-zinc-500">Finish pending setup before adding another account.</p>
      )}

      {create.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(create.error as Error).message}
        </div>
      )}
    </div>
  );
}
