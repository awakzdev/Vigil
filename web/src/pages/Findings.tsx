import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api, token } from "../api";
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

const COLLAPSED_FINDINGS_KEY = "vigil.findings.collapsedGroups";

const sevBadge: Record<string, string> = {
  critical: "border-red-200 bg-red-50 text-red-700",
  high: "border-red-200 bg-red-50 text-red-600",
  medium: "border-amber-200 bg-amber-50 text-amber-600",
  low: "border-zinc-200 bg-zinc-50 text-zinc-500",
};

const sevWeight: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const checkLabels: Record<string, string> = {
  "iam.user.no_mfa": "MFA not enabled",
  "iam.user.inactive_90d": "Inactive user",
  "iam.access_key.unused_90d": "Unused access key",
  "iam.access_key.no_rotation_90d": "Long-lived access key",
  "iam.access_key.multiple_active": "Multiple active access keys",
  "iam.role.unassumed_90d": "Role unassumed",
  "iam.role.wildcard_action": "Wildcard action",
  "iam.role.unused_services_90d": "Unused granted services",
  "iam.role.trust_wildcard": "Wildcard trust policy",
  "iam.role.allows_iam_star": "Grants iam:*",
  "iam.role.confused_deputy": "Confused deputy risk",
};

const checkDescriptions: Record<string, string> = {
  "iam.user.no_mfa": "Require MFA for interactive IAM users.",
  "iam.user.inactive_90d": "Disable or remove dormant IAM users.",
  "iam.access_key.unused_90d": "Deactivate stale access keys, then delete after validation.",
  "iam.access_key.no_rotation_90d": "Rotate active keys older than 90 days.",
  "iam.access_key.multiple_active": "Valid during rotation, but persistent duplicates increase exposure.",
  "iam.role.unassumed_90d": "Confirm ownership, then remove roles that are no longer used.",
  "iam.role.wildcard_action": "Replace wildcard permissions with scoped actions.",
  "iam.role.unused_services_90d": "Trim unused service permissions from role policies.",
  "iam.role.trust_wildcard": "Trust policy allows an unrestricted principal.",
  "iam.role.allows_iam_star": "Inline policy grants iam:* — privilege escalation path.",
  "iam.role.confused_deputy": "Cross-account trust without ExternalId — confused deputy risk.",
};

const statusTabs = ["open", "snoozed", "resolved", "all"] as const;
type StatusTab = (typeof statusTabs)[number];
type SeverityFilter = "all" | "critical_high" | "medium" | "low";
type SortKey = "severity" | "score" | "first_seen";

function loadCollapsedGroups(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSED_FINDINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function resourceName(arn: string): string {
  const tail = arn.split(":").pop() ?? arn;
  const [, rest = tail] = tail.split(/\/(.+)/);
  const [name, suffix] = rest.split("#");
  if (!suffix) return name || rest;
  const masked = suffix.length > 12 ? `${suffix.slice(0, 4)}…${suffix.slice(-4)}` : suffix;
  return `${name} · ${masked}`;
}

function daysAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "today";
  if (d === 1) return "1d";
  if (d < 30) return `${d}d`;
  if (d < 365) return `${Math.floor(d / 30)}mo`;
  return `${Math.floor(d / 365)}y`;
}

function lastScanLabel(iso: string): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return sameDay ? `today at ${time}` : `${date.toLocaleDateString()} at ${time}`;
}

function matchesSeverityFilter(f: Finding, filter: SeverityFilter): boolean {
  if (filter === "all") return true;
  if (filter === "critical_high") return f.severity === "critical" || f.severity === "high";
  return f.severity === filter;
}

function sortLabel(k: SortKey): string {
  if (k === "first_seen") return "Age";
  return k.charAt(0).toUpperCase() + k.slice(1);
}

function sortIcon(k: SortKey, active: SortKey, dir: "asc" | "desc"): string {
  if (k !== active) return "";
  return dir === "asc" ? "↑" : "↓";
}

export default function Findings() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<StatusTab>("open");
  const [selected, setSelected] = useState<Finding | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("severity");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => loadCollapsedGroups());
  const prevScanStatus = useRef<string | null>(null);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_FINDINGS_KEY, JSON.stringify(collapsed));
  }, [collapsed]);

  const downloadCsv = useCallback(async () => {
    const BASE = (import.meta.env.VITE_API_URL as string) || "http://localhost:8000";
    const t = token();
    const res = await fetch(`${BASE}/v1/findings/export/csv?status=${status}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vigil-findings.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [status]);

  const q = useQuery({ queryKey: ["findings", status], queryFn: () => api<Finding[]>(`/v1/findings?status=${status}`) });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => api<Account[]>("/v1/accounts") });
  const connectedId = accounts.data?.find((a) => a.status === "connected")?.id;

  const scanRun = useQuery({
    queryKey: ["scan-run-latest", connectedId],
    queryFn: () => connectedId ? api<{ id: string; status: string; started_at: string; finished_at: string | null; error: string | null } | null>(`/v1/accounts/${connectedId}/scan-runs/latest`) : null,
    enabled: !!connectedId,
    refetchInterval: (query) => query.state.data?.status === "running" ? 5000 : false,
  });

  const scanStatus = scanRun.data?.status ?? null;
  const scanStartedAt = scanRun.data?.started_at ? new Date(scanRun.data.started_at) : null;
  const scanStuck = scanStartedAt ? Date.now() - scanStartedAt.getTime() > 5 * 60 * 1000 : false;
  const isRunning = scanStatus === "running" && !scanStuck;

  useEffect(() => {
    if (prevScanStatus.current === "running" && scanStatus === "ok") qc.invalidateQueries({ queryKey: ["findings"] });
    prevScanStatus.current = scanStatus;
  }, [scanStatus, qc]);

  const scan = useMutation({ mutationFn: (id: string) => api(`/v1/accounts/${id}/scan`, { method: "POST" }), onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ["scan-run-latest"] }), 1000) });
  const act = useMutation({ mutationFn: ({ id, action }: { id: string; action: "snooze" | "resolve" | "ignore" }) => api(`/v1/findings/${id}/${action}`, { method: "POST", body: action === "snooze" ? JSON.stringify({ days: 30 }) : JSON.stringify({}) }), onSuccess: () => qc.invalidateQueries({ queryKey: ["findings"] }) });

  const findings = q.data ?? [];
  const totals = useMemo(() => {
    const t = { open: 0, critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of findings) {
      t.open++;
      if (f.severity in t) t[f.severity as keyof typeof t]++;
    }
    return t;
  }, [findings]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const arr = findings.filter((f) => {
      if (!matchesSeverityFilter(f, severityFilter)) return false;
      if (!needle) return true;
      return [f.title, f.check_id, f.resource_arn, checkLabels[f.check_id] ?? "", checkDescriptions[f.check_id] ?? ""].join(" ").toLowerCase().includes(needle);
    });
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "severity") cmp = (sevWeight[a.severity] ?? 9) - (sevWeight[b.severity] ?? 9) || b.risk_score - a.risk_score;
      else if (sortKey === "score") cmp = b.risk_score - a.risk_score;
      else cmp = new Date(b.first_seen).getTime() - new Date(a.first_seen).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [findings, search, severityFilter, sortKey, sortDir]);

  const grouped = useMemo(() => {
    if (sortKey !== "severity") return null;
    const map = new Map<string, Finding[]>();
    for (const f of rows) {
      const list = map.get(f.check_id) ?? [];
      list.push(f);
      map.set(f.check_id, list);
    }
    return [...map.entries()].sort(([, a], [, b]) => (sevWeight[a[0].severity] ?? 9) - (sevWeight[b[0].severity] ?? 9) || b.length - a.length);
  }, [rows, sortKey]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "severity" ? "asc" : "desc");
    }
  }

  const summaryCards = [
    { key: "all" as SeverityFilter, label: "Open", value: totals.open, tone: "text-zinc-900", dot: "bg-zinc-400" },
    { key: "critical_high" as SeverityFilter, label: "Critical / High", value: totals.critical + totals.high, tone: "text-red-600", dot: "bg-red-500" },
    { key: "medium" as SeverityFilter, label: "Medium", value: totals.medium, tone: "text-amber-600", dot: "bg-amber-500" },
    { key: "low" as SeverityFilter, label: "Low", value: totals.low, tone: "text-zinc-500", dot: "bg-zinc-300" },
  ];

  return <div />;
}
