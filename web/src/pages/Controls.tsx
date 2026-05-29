import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, token } from "../api";
import { labelForCheck } from "../data/checkLabels";
import { FRAMEWORKS } from "../data/frameworks";
import { EvidencePackExportPanel } from "../components/EvidencePackExportPanel";
import type { EvidenceCoverage } from "../lib/evidenceCoverage";

const BASE = (import.meta.env.VITE_API_URL as string) || "http://localhost:8000";

type Account = { id: string; label: string; account_id: string | null; status: string; last_scan_at: string | null };

type ControlRow = {
  id: string;
  framework: string;
  control_id: string;
  title: string;
  description: string;
  guidance: string | null;
  narrative: string | null;
  short_answer: string | null;
  long_answer: string | null;
  evidence_refs: string[];
  known_gaps: string[];
  check_ids: string[];
  coverage_tier?: "core" | "extended" | "mixed" | "no_data";
  coverage_label?: string | null;
  extended_check_ids?: string[];
  check_tiers?: Record<string, string>;
  check_evidence_classes?: Record<string, string>;
  status: "pass" | "fail" | "no_data";
  finding_count: number;
  open_finding_ids: string[];
};

type EvidencePreview = {
  control_id: string;
  snapshot_count: number;
  period_days: number;
  snapshots: { id: string; entity_type: string; entity_id: string; taken_at: string; data?: Record<string, unknown> }[];
};

type EvidenceDiff = {
  found: boolean;
  message?: string;
  change_count: number;
  exposure_note: string | null;
  snapshot_a: { taken_at: string | null };
  snapshot_b: { taken_at: string | null };
  changes: { field: string; before: unknown; after: unknown }[];
};

type ControlHistory = {
  current_status: string;
  failing_since: string | null;
  days_failing: number | null;
  open_finding_count: number;
  segments: { status: string; from: string; to: string; duration_seconds: number }[];
  events: { timestamp: string; type: string; detail: string }[];
};

const AUDIT_WINDOWS = [
  { value: "last_scan", label: "Last scan (point-in-time)" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: 180, label: "Last 180 days" },
  { value: 365, label: "Last 365 days" },
] as const;

type StatusFilter = "all" | "pass" | "fail" | "no_data";

const statusAccent: Record<string, string> = {
  pass: "border-l-emerald-300/50",
  fail: "border-l-red-300/50",
  no_data: "border-l-zinc-200/80",
};

const statusExpandedBg: Record<string, string> = {
  pass: "bg-emerald-50/15",
  fail: "bg-red-50/10",
  no_data: "bg-zinc-50/40",
};

type OpenFindingMeta = { id: string; check_id: string; severity: string; resource_arn: string };

function StatusIndicator({ status }: { status: string }) {
  if (status === "pass") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50/90 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200/50">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/90" aria-hidden />
        Pass
      </span>
    );
  }
  if (status === "fail") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50/80 px-2.5 py-1 text-[11px] font-medium text-red-700 ring-1 ring-red-200/45">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500/75" aria-hidden />
        Failing
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100/90 px-2.5 py-1 text-[11px] font-medium text-zinc-500 ring-1 ring-zinc-200/70">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400/80" aria-hidden />
      No data
    </span>
  );
}

/** Fixed-size findings column badge (56×28px) — width must not vary by digit count. */
function FindingCountBadge({ count, status }: { count: number; status: string }) {
  if (status === "fail") {
    return (
      <span
        className="inline-flex h-7 w-14 items-center justify-center rounded-md bg-red-50 text-sm font-bold tabular-nums leading-none text-red-700 ring-1 ring-red-200/60"
        aria-label={`${count} open findings`}
      >
        {count}
      </span>
    );
  }
  if (status === "pass") {
    return (
      <span
        className="inline-flex h-7 w-14 items-center justify-center rounded-md bg-emerald-50/70 text-[11px] font-semibold text-emerald-600/70 ring-1 ring-emerald-200/50"
        aria-hidden
      >
        —
      </span>
    );
  }
  return (
    <span className="inline-flex h-7 w-14 items-center justify-center text-xs text-zinc-300" aria-hidden>
      —
    </span>
  );
}

function controlRowMetadata(
  ctrl: ControlRow,
  findingMap: Map<string, OpenFindingMeta>,
  lastScanAt: string | null,
): string {
  const parts: string[] = [];
  if (ctrl.check_ids.length > 0) {
    parts.push(`${ctrl.check_ids.length} check${ctrl.check_ids.length === 1 ? "" : "s"} mapped`);
  }
  if (ctrl.status === "fail" && ctrl.open_finding_ids.length > 0) {
    const linked = ctrl.open_finding_ids
      .map((id) => findingMap.get(id))
      .filter((f): f is OpenFindingMeta => !!f);
    const urgent = linked.filter((f) => f.severity === "critical" || f.severity === "high").length;
    if (urgent > 0) parts.push(`${urgent} critical/high`);
    const resources = new Set(linked.map((f) => f.resource_arn)).size;
    if (resources > 0) parts.push(`${resources} resource${resources === 1 ? "" : "s"}`);
  }
  if (lastScanAt) parts.push(`scanned ${lastScanLabel(lastScanAt)}`);
  if (parts.length === 0) {
    return ctrl.check_ids.length === 0 ? "Manual attestation required" : "Awaiting scan data";
  }
  return parts.join(" · ");
}

function shortFamilyLabel(label: string) {
  const parts = label.split(" ");
  if (parts.length >= 2 && /^(CC\d|CIS|A\.\d)/.test(parts[0])) {
    return parts.slice(0, 2).join(" ");
  }
  return label;
}

function passRateColor(pct: number) {
  if (pct >= 80) return "text-emerald-600";
  if (pct >= 50) return "text-amber-600";
  return "text-red-600";
}

function passRateBarColor(pct: number) {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-red-500";
}

type ControlGroup = {
  key: string;
  label: string;
  rows: ControlRow[];
  passed: number;
  failed: number;
  noData: number;
};

function controlFamily(framework: string, controlId: string) {
  if (framework === "soc2") {
    if (controlId.startsWith("CC6")) return { key: "cc6", label: "CC6 Logical Access" };
    if (controlId.startsWith("CC7")) return { key: "cc7", label: "CC7 System Operations" };
    if (controlId.startsWith("CC8")) return { key: "cc8", label: "CC8 Change Management" };
  }

  if (framework === "cis_aws_l1") {
    const section = controlId.split(".")[0];
    if (section === "1") return { key: "cis-1", label: "CIS 1 Identity and Access" };
    if (section === "2") return { key: "cis-2", label: "CIS 2 Storage and Logging" };
    if (section === "3") return { key: "cis-3", label: "CIS 3 Networking" };
    if (section === "4") return { key: "cis-4", label: "CIS 4 Monitoring" };
  }

  if (framework === "iso27001") {
    if (controlId.startsWith("A.9")) return { key: "iso-a9", label: "A.9 Access Control" };
    if (controlId.startsWith("A.10")) return { key: "iso-a10", label: "A.10 Cryptography" };
    if (controlId.startsWith("A.12")) return { key: "iso-a12", label: "A.12 Operations Security" };
    if (controlId.startsWith("A.13")) return { key: "iso-a13", label: "A.13 Communications Security" };
  }

  return { key: "other", label: "Other Controls" };
}

function groupControls(rows: ControlRow[], framework: string): ControlGroup[] {
  const groups = new Map<string, ControlGroup>();

  for (const row of rows) {
    const family = controlFamily(framework, row.control_id);
    const existing = groups.get(family.key);
    const group = existing ?? {
      key: family.key,
      label: family.label,
      rows: [],
      passed: 0,
      failed: 0,
      noData: 0,
    };

    group.rows.push(row);
    if (row.status === "pass") group.passed += 1;
    if (row.status === "fail") group.failed += 1;
    if (row.status === "no_data") group.noData += 1;
    groups.set(family.key, group);
  }

  for (const group of groups.values()) {
    group.rows.sort((a, b) => {
      const statusRank = (s: ControlRow["status"]) => (s === "fail" ? 0 : s === "no_data" ? 1 : 2);
      const rankDiff = statusRank(a.status) - statusRank(b.status);
      if (rankDiff !== 0) return rankDiff;
      if (a.status === "fail" && b.status === "fail") {
        return b.finding_count - a.finding_count;
      }
      return a.control_id.localeCompare(b.control_id);
    });
  }

  return Array.from(groups.values());
}

function shortControlTitle(title: string) {
  const parts = title.split("—");
  return parts.length > 1 ? parts.slice(1).join("—").trim() : title;
}

function findingLabel(count: number) {
  return `${count} finding${count === 1 ? "" : "s"}`;
}

function controlTheme(control: ControlRow) {
  const ids = control.check_ids.join(" ");
  if (/iam|github\.org|gitlab\.org/.test(ids)) return "identity-related";
  if (/github\.repo|gitlab\.repo/.test(ids)) return "change-management";
  if (/cloudtrail|guardduty|securityhub|aws\.config|vpc/.test(ids)) return "monitoring and logging";
  if (/s3|kms|rds|ec2\.ebs/.test(ids)) return "data-protection";
  if (/ec2\.security_group|rds\.instance\.publicly_accessible/.test(ids)) return "network-exposure";
  return "mapped";
}

function controlSummary(control: ControlRow): string {
  if (control.check_ids.length === 0) {
    return "Not automated in Vigil yet — CIS expects this control; map manually or wait for a future check.";
  }
  if (control.status === "pass") {
    return "Passing — no open findings. Keep in the evidence pack for audit review.";
  }
  if (control.status === "no_data") {
    return "Not evaluated yet — run a scan or connect the required evidence source.";
  }
  const theme = controlTheme(control);
  const action =
    theme === "identity-related"
      ? "Remediate stale or over-permissive identities."
      : theme === "change-management"
        ? "Restore branch protection and review requirements."
        : theme === "monitoring and logging"
          ? "Enable the missing monitoring or audit-log controls."
          : theme === "data-protection"
            ? "Fix encryption, retention, or storage protection gaps."
            : theme === "network-exposure"
              ? "Remove public or unrestricted network exposure."
              : "Remediate the mapped checks blocking this control.";
  return `${control.finding_count} open ${theme} ${control.finding_count === 1 ? "finding" : "findings"}. ${action}`;
}

function formatEvidenceDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function lastScanLabel(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-10 rounded-xl border border-zinc-200 bg-zinc-50" />
      <div className="h-96 rounded-2xl border border-zinc-200 bg-zinc-50" />
    </div>
  );
}

function checkGroupLabel(id: string): string {
  if (id.startsWith("github.")) return "GitHub";
  if (id.startsWith("gitlab.")) return "GitLab";
  if (id.startsWith("iam.")) return "IAM";
  if (id.startsWith("s3.")) return "S3";
  if (id.startsWith("kms.")) return "KMS";
  if (id.startsWith("cloudtrail.")) return "CloudTrail";
  if (id.startsWith("ec2.")) return "EC2";
  if (id.startsWith("rds.")) return "RDS";
  if (id.startsWith("guardduty.")) return "GuardDuty";
  if (id.startsWith("aws.")) return "AWS";
  if (id.startsWith("vpc.")) return "VPC";
  if (id.startsWith("lambda.")) return "Lambda";
  if (id.startsWith("dynamodb.")) return "DynamoDB";
  if (id.startsWith("acm.")) return "ACM";
  if (id.startsWith("elb.")) return "ELB";
  if (id.startsWith("secretsmanager.")) return "Secrets";
  if (id.startsWith("ssm.")) return "SSM";
  if (id.startsWith("sns.")) return "SNS";
  if (id.startsWith("sqs.")) return "SQS";
  const prefix = id.split(".")[0] ?? id;
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

const CHECK_GROUP_ORDER = ["IAM", "GitHub", "GitLab", "S3", "KMS", "CloudTrail", "EC2", "RDS", "Lambda", "DynamoDB", "ACM", "ELB", "Secrets", "SSM", "SNS", "SQS", "GuardDuty", "AWS", "VPC"];

function groupCheckIds(checkIds: string[]) {
  const groups = new Map<string, string[]>();
  for (const id of checkIds) {
    const label = checkGroupLabel(id);
    const list = groups.get(label) ?? [];
    list.push(id);
    groups.set(label, list);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => {
    const ai = CHECK_GROUP_ORDER.indexOf(a);
    const bi = CHECK_GROUP_ORDER.indexOf(b);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.localeCompare(b);
  });
}

const EVIDENCE_CLASS_LABELS: Record<string, string> = {
  benchmark: "Benchmark",
  supporting: "Supporting",
  hygiene: "Hygiene",
};

function EvidenceClassBadge({ evidenceClass }: { evidenceClass?: string }) {
  if (!evidenceClass || evidenceClass === "benchmark") return null;
  const label = EVIDENCE_CLASS_LABELS[evidenceClass] ?? evidenceClass;
  const styles =
    evidenceClass === "supporting"
      ? "bg-sky-50 text-sky-800 ring-sky-200/70"
      : "bg-zinc-100 text-zinc-600 ring-zinc-200/80";
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${styles}`}>
      {label}
    </span>
  );
}

function CoverageTierBadge({ tier, label }: { tier?: string; label?: string | null }) {
  if (!tier || tier === "core" || tier === "no_data") return null;
  const text = label ?? (tier === "extended" ? "Supports control objective" : "Core + extended");
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
        tier === "extended"
          ? "bg-sky-50 text-sky-800 ring-sky-200/70"
          : "bg-violet-50 text-violet-800 ring-violet-200/70"
      }`}
    >
      {text}
    </span>
  );
}

function DisclosureSection({
  title,
  badge,
  children,
  className = "",
}: {
  title: string;
  badge?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={`group rounded-xl border border-zinc-200/80 bg-zinc-50/40 ${className}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <svg
            className="h-3.5 w-3.5 shrink-0 text-zinc-400 transition group-open:rotate-90"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{title}</span>
          {badge ? <span className="truncate text-xs font-medium normal-case text-zinc-600">{badge}</span> : null}
        </span>
      </summary>
      <div className="border-t border-zinc-200/70 px-4 pb-3 pt-2.5">{children}</div>
    </details>
  );
}

function formatCheckSummary(checkIds: string[], max = 4) {
  if (checkIds.length === 0) return "Manual attestation required";
  const labels = checkIds.map((id) => labelForCheck(id));
  if (labels.length <= max) return labels.join(", ");
  return `${labels.slice(0, max).join(", ")} + ${labels.length - max} more`;
}

const EMPTY_CHECK_COUNTS = new Map<string, number>();

function MappedChecksList({
  checkIds,
  checkTiers = {},
  checkEvidenceClasses = {},
  findingCountByCheck = EMPTY_CHECK_COUNTS,
}: {
  checkIds: string[];
  checkTiers?: Record<string, string>;
  checkEvidenceClasses?: Record<string, string>;
  findingCountByCheck?: Map<string, number>;
}) {
  const navigate = useNavigate();
  const sortedCheckIds = useMemo(
    () =>
      [...checkIds].sort(
        (a, b) => (findingCountByCheck.get(b) ?? 0) - (findingCountByCheck.get(a) ?? 0),
      ),
    [checkIds, findingCountByCheck],
  );
  const grouped = useMemo(() => groupCheckIds(sortedCheckIds), [sortedCheckIds]);

  return (
    <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/40 p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Mapped checks ({checkIds.length})
      </p>
      <p className="mt-0.5 text-[11px] text-zinc-500">How Vigil evaluates this control · hover a row for check ID</p>
      <div className="mt-2.5 space-y-2.5">
        {grouped.map(([group, ids]) => (
          <div key={group}>
            <p className="mb-1.5 text-xs font-semibold text-zinc-700">{group}</p>
            <ul className="overflow-hidden rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-100">
              {ids.map((cid) => {
                const openCount = findingCountByCheck.get(cid) ?? 0;
                return (
                <li key={cid}>
                  <button
                    type="button"
                    title={cid}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => navigate(`/findings?checks=${encodeURIComponent(cid)}`)}
                    className="group flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-zinc-50/80"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug text-zinc-900 group-hover:text-indigo-700">
                        {labelForCheck(cid)}
                        {openCount > 0 && (
                          <span className="ml-1.5 tabular-nums text-red-600/90">({openCount})</span>
                        )}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {checkTiers[cid] === "extended" && (
                          <span className="text-[10px] font-medium text-sky-700">Supports control objective</span>
                        )}
                        <EvidenceClassBadge evidenceClass={checkEvidenceClasses[cid]} />
                      </div>
                    </div>
                    <svg
                      className="h-3.5 w-3.5 shrink-0 text-zinc-400 transition-colors group-hover:text-indigo-500"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                </li>
              );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

type QuestionnaireDraft = { body: string; notes: string[] };

function buildQuestionnaireDraft(control: ControlRow, periodDays: number): QuestionnaireDraft | null {
  const body = (control.long_answer ?? control.narrative ?? control.description).trim();
  const short = control.short_answer?.trim();
  if (!body && !short) return null;

  const notes: string[] = [];
  if (short && short !== body) {
    notes.push(`Short answer: ${short}`);
  }
  if (control.evidence_refs.length > 0) {
    notes.push(`Evidence: ${control.evidence_refs.slice(0, 3).join("; ")}`);
  }
  if (control.known_gaps.length > 0) {
    notes.push(`Scope limitations: ${control.known_gaps.join(" ")}`);
  }

  if (control.check_ids.length === 0) {
    notes.push("Status: Not automated in Vigil — no mapped checks for this CIS control yet.");
    notes.push("Answer manually for auditors (e.g. confirm IAM users have no directly attached policies).");
    return { body: body || short!, notes };
  }

  if (control.status === "no_data") {
    notes.push("Status: Not yet evaluated in Vigil (no scan data for mapped checks, or required sources are not connected).");
    notes.push("Run a scan before submitting this answer to auditors.");
    return { body: body || short!, notes };
  }

  if (control.status === "pass") {
    notes.push(`Status: Passing as of the latest Vigil scan (0 open findings mapped to ${control.control_id} in the last ${periodDays} days).`);
    return { body: body || short!, notes };
  }

  notes.push(`Status: ${findingLabel(control.finding_count)} mapped to ${control.control_id} as of the latest scan.`);
  notes.push("Edit before submitting to auditors — describe remediation in progress, compensating controls, or documented exceptions.");
  notes.push("After remediation, re-scan and export the evidence pack for audit sampling.");
  return { body: body || short!, notes };
}

function questionnaireDraftText(draft: QuestionnaireDraft) {
  return [draft.body, ...draft.notes].join("\n");
}

function questionnaireMeta(control: ControlRow) {
  if (control.check_ids.length === 0) {
    return {
      label: "Auditor response template",
      hint: "Not automated in Vigil — manual attestation for auditors.",
      box: "border-zinc-200 bg-zinc-50/80",
      labelColor: "text-zinc-600",
      textColor: "text-zinc-800",
      btn: "border-zinc-200 text-zinc-700 hover:bg-zinc-100",
    };
  }
  const status = control.status;
  if (status === "pass") {
    return {
      label: "Auditor response template",
      hint: "Adapt for Vanta, Drata, or auditor forms.",
      box: "border-violet-200/80 bg-violet-50/40",
      labelColor: "text-violet-600",
      textColor: "text-violet-950/90",
      btn: "border-violet-200 text-violet-700 hover:bg-violet-50",
    };
  }
  if (status === "fail") {
    return {
      label: "Auditor response template",
      hint: "Control is failing — add remediation status before submitting.",
      box: "border-amber-200/80 bg-amber-50/40",
      labelColor: "text-amber-800",
      textColor: "text-amber-950/90",
      btn: "border-amber-200 text-amber-800 hover:bg-amber-50",
    };
  }
  return {
    label: "Auditor response template",
    hint: "Not evaluated yet — run a scan first.",
    box: "border-zinc-200 bg-zinc-50/80",
    labelColor: "text-zinc-600",
    textColor: "text-zinc-800",
    btn: "border-zinc-200 text-zinc-700 hover:bg-zinc-100",
  };
}

function ControlAuditEvidenceBlock({
  control,
  periodDays,
  coverage,
}: {
  control: ControlRow;
  periodDays: number;
  coverage?: EvidenceCoverage;
}) {
  const statusLine =
    control.status === "pass"
      ? `Passing — 0 open findings in the last ${periodDays} days`
      : control.status === "fail"
        ? `${control.finding_count} open finding${control.finding_count === 1 ? "" : "s"}`
        : "Not yet evaluated — run a scan";

  const periodLine = coverage
    ? `${coverage.coverage_label} · ${Math.round(coverage.coverage_ratio * 100)}% of ${periodDays}d with scans (${coverage.successful_scans_in_period} scan${coverage.successful_scans_in_period === 1 ? "" : "s"})`
    : `Rolling ${periodDays}-day evidence window`;

  const bullets = [
    control.description ? `${control.title} — ${control.description}` : control.title,
    `Vigil collects: ${formatCheckSummary(control.check_ids)}`,
    periodLine,
    `Status: ${statusLine}`,
  ];
  if (control.check_ids.length === 0) {
    bullets.push("Manual attestation required — no automated Vigil checks mapped.");
  }

  return (
    <div className="rounded-xl border border-indigo-200/70 bg-indigo-50/25 p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700">Auditor summary</p>
      <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-zinc-800">
        {bullets.map((line) => (
          <li key={line} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-indigo-400/80" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      {coverage?.warning && <p className="mt-2 text-[11px] text-amber-800/90">{coverage.warning}</p>}
    </div>
  );
}

function NarrativeDetailBlock({ control }: { control: ControlRow }) {
  const hasShort = Boolean(control.short_answer?.trim());
  const hasRefs = control.evidence_refs.length > 0;
  if (!hasShort && !hasRefs) return null;

  return (
    <div className="space-y-3">
      {hasShort && (
        <div className="rounded-xl border border-zinc-200/80 bg-white/80 p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Short answer</p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-800">{control.short_answer}</p>
        </div>
      )}
      {hasRefs && (
        <DisclosureSection title="Evidence sources" badge={`${control.evidence_refs.length}`}>
          <ul className="space-y-1">
            {control.evidence_refs.map((ref) => (
              <li key={ref} className="font-mono text-[11px] leading-relaxed text-zinc-600">
                {ref}
              </li>
            ))}
          </ul>
        </DisclosureSection>
      )}
    </div>
  );
}

function QuestionnaireAnswerBlock({ control, periodDays }: { control: ControlRow; periodDays: number }) {
  const [copied, setCopied] = useState(false);
  const draft = buildQuestionnaireDraft(control, periodDays);
  const meta = questionnaireMeta(control);

  if (!draft) return null;
  const content = draft;

  async function copy() {
    await navigator.clipboard.writeText(questionnaireDraftText(content));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const noteDivider =
    control.status === "pass"
      ? "border-violet-200/60"
      : control.status === "fail"
        ? "border-amber-200/60"
        : "border-zinc-200";

  return (
    <details className={`group rounded-xl border ${meta.box}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <svg
            className="h-3.5 w-3.5 shrink-0 text-zinc-400 transition group-open:rotate-90"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${meta.labelColor}`}>
            {meta.label}
          </span>
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            void copy();
          }}
          className={`inline-flex shrink-0 items-center gap-1 rounded-lg border bg-white px-2.5 py-1 text-[11px] font-semibold transition ${meta.btn}`}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </summary>
      <div className="border-t border-zinc-200/60 px-3.5 pb-3.5 pt-2.5">
        <p className={`text-[11px] ${meta.labelColor} opacity-80`}>{meta.hint}</p>
        <p className={`mt-2 text-sm leading-relaxed ${meta.textColor}`}>{content.body}</p>
        {content.notes.length > 0 && (
          <div className={`mt-2 space-y-1 border-t pt-2 ${noteDivider}`}>
            {content.notes.map((note) => (
              <p key={note} className={`text-xs leading-snug ${meta.textColor} opacity-90`}>
                {note}
              </p>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

function ControlHistoryPanel({
  controlId,
  framework,
  accountId,
  period,
}: {
  controlId: string;
  framework: string;
  accountId: string;
  period: number;
}) {
  const history = useQuery({
    queryKey: ["control-history", controlId, framework, accountId, period],
    queryFn: () =>
      api<ControlHistory>(
        `/v1/controls/${encodeURIComponent(controlId)}/history?framework=${framework}&account_id=${accountId}&days=${period}`
      ),
  });

  if (history.isLoading) {
    return <p className="mt-4 text-xs text-zinc-400">Loading control history…</p>;
  }
  if (history.isError || !history.data) return null;

  const h = history.data;
  const failSegments = h.segments.filter((s) => s.status === "fail");
  const passSegments = h.segments.filter((s) => s.status === "pass");
  const longestFailSeconds = failSegments.reduce((max, s) => Math.max(max, s.duration_seconds), 0);
  const lastPassingAt =
    passSegments.length > 0 ? passSegments[passSegments.length - 1]!.to : null;

  const lines: string[] = [];
  if (h.current_status === "fail") {
    if (h.failing_since) {
      lines.push(`Failing since ${formatEvidenceDate(h.failing_since)}`);
    } else if (h.days_failing != null) {
      lines.push(`Failing for ${h.days_failing} day${h.days_failing === 1 ? "" : "s"}`);
    }
  } else if (h.current_status === "pass") {
    lines.push("Currently passing");
  }
  if (longestFailSeconds > 0) {
    lines.push(`Longest failing streak: ${formatDuration(longestFailSeconds)}`);
  }
  if (lastPassingAt) {
    lines.push(`Last passing evaluation: ${formatEvidenceDate(lastPassingAt)}`);
  }
  if (lines.length === 0) return null;

  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white px-3.5 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Control history</p>
      <ul className="mt-1.5 space-y-0.5">
        {lines.map((line) => (
          <li key={line} className="text-xs text-zinc-700">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function HistoricalDiffPanel({
  accountId,
  snapshots,
  period,
}: {
  accountId: string;
  snapshots: EvidencePreview["snapshots"];
  period: number;
}) {
  const [entityKey, setEntityKey] = useState("");
  const selected = useMemo(() => {
    if (entityKey) {
      return snapshots.find((s) => `${s.entity_type}:${s.entity_id}` === entityKey);
    }
    return snapshots[0];
  }, [entityKey, snapshots]);

  const diff = useQuery({
    queryKey: ["evidence-diff", accountId, selected?.entity_type, selected?.entity_id, period],
    queryFn: () => {
      if (!selected) return Promise.resolve(null);
      const atB = new Date().toISOString();
      const atA = new Date(Date.now() - period * 86400_000).toISOString();
      return api<EvidenceDiff>(
        `/v1/accounts/${accountId}/evidence-diff?entity_type=${encodeURIComponent(selected.entity_type)}&entity_id=${encodeURIComponent(selected.entity_id)}&at_a=${encodeURIComponent(atA)}&at_b=${encodeURIComponent(atB)}`
      );
    },
    enabled: !!selected,
  });

  if (snapshots.length === 0) return null;

  const userFacingChanges = (diff.data?.changes ?? []).filter((c) => !c.field.startsWith("_provenance"));
  const hiddenMeta = (diff.data?.changes.length ?? 0) - userFacingChanges.length;

  return (
    <div className="mt-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Historical diff</p>
      <p className="mt-0.5 text-[11px] text-zinc-600">State at start vs end of the {period}-day window.</p>
      {snapshots.length > 1 && selected && (
        <select
          value={`${selected.entity_type}:${selected.entity_id}`}
          onChange={(e) => setEntityKey(e.target.value)}
          className="mt-3 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-mono text-zinc-700"
        >
          {snapshots.slice(0, 20).map((s) => {
            const key = `${s.entity_type}:${s.entity_id}`;
            return (
              <option key={key} value={key}>
                {s.entity_type} — {s.entity_id.slice(0, 60)}
              </option>
            );
          })}
        </select>
      )}
      {diff.isLoading && <p className="mt-3 text-xs text-zinc-400">Computing diff…</p>}
      {diff.data && !diff.data.found && (
        <p className="mt-3 text-xs text-zinc-500">{diff.data.message ?? "No diff available."}</p>
      )}
      {diff.data?.found && (
        <div className="mt-2 space-y-2">
          {diff.data.exposure_note && (
            <p className="text-[11px] font-medium text-amber-800">{diff.data.exposure_note}</p>
          )}
          {userFacingChanges.length === 0 ? (
            <p className="text-xs text-emerald-700">
              {hiddenMeta > 0
                ? `No user-facing changes (${hiddenMeta} internal metadata field${hiddenMeta === 1 ? "" : "s"} hidden).`
                : "No field changes detected in this window."}
            </p>
          ) : (
            <>
              {hiddenMeta > 0 && (
                <p className="text-[10px] text-zinc-500">
                  {hiddenMeta} internal metadata field{hiddenMeta === 1 ? "" : "s"} hidden
                </p>
              )}
              <ul className="max-h-40 space-y-1.5 overflow-y-auto">
                {userFacingChanges.slice(0, 8).map((c) => (
                  <li key={c.field} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs">
                    <p className="font-mono text-[11px] font-semibold text-zinc-800">{c.field}</p>
                    <p className="mt-0.5 text-red-600 line-through">{String(c.before ?? "—")}</p>
                    <p className="text-emerald-700">{String(c.after ?? "—")}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function EvidencePreviewPanel({
  controlId,
  accountId,
  period,
}: {
  controlId: string;
  accountId: string;
  period: number;
}) {
  const evidence = useQuery({
    queryKey: ["control-evidence", controlId, accountId, period],
    queryFn: () =>
      api<EvidencePreview>(
        `/v1/controls/${encodeURIComponent(controlId)}/evidence?account_id=${accountId}&period=${period}`
      ),
  });

  if (evidence.isLoading) {
    return <p className="text-xs text-zinc-400">Loading evidence snapshots…</p>;
  }

  if (evidence.isError || !evidence.data) {
    return <p className="text-xs text-zinc-400">Evidence preview unavailable.</p>;
  }

  const { snapshot_count, snapshots } = evidence.data;
  const entityTypes = Array.from(new Set(snapshots.map((s) => s.entity_type)));
  const latest = snapshots[0]?.taken_at;

  return (
    <>
      <p className="text-xs text-zinc-700">
        {snapshot_count === 0
          ? "No snapshots in this audit window"
          : `${snapshot_count} snapshot${snapshot_count === 1 ? "" : "s"} in the last ${period} days`}
        {latest ? ` · latest ${formatEvidenceDate(latest)}` : ""}
      </p>
      {entityTypes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {entityTypes.slice(0, 6).map((type) => (
            <span
              key={type}
              className="rounded-md bg-white px-1.5 py-0.5 font-mono text-[10px] text-indigo-700 ring-1 ring-indigo-100/80"
            >
              {type}
            </span>
          ))}
          {entityTypes.length > 6 && (
            <span className="px-1 text-[10px] text-zinc-500">+{entityTypes.length - 6}</span>
          )}
        </div>
      )}
      <HistoricalDiffPanel accountId={accountId} snapshots={snapshots} period={period} />
    </>
  );
}

type FrameworkStats = {
  passRate: number | null;
  failed: number;
  passed: number;
  total: number;
};

function useFrameworkStats(framework: string, accountId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["controls", framework, accountId],
    queryFn: () =>
      api<ControlRow[]>(
        `/v1/controls?framework=${framework}${accountId ? `&account_id=${accountId}` : ""}`
      ),
    enabled,
    select: (rows): FrameworkStats => {
      const total = rows.length;
      const passed = rows.filter((r) => r.status === "pass").length;
      const failed = rows.filter((r) => r.status === "fail").length;
      return {
        passRate: total > 0 ? Math.round((passed / total) * 100) : null,
        failed,
        passed,
        total,
      };
    },
  });
}

/** Compact framework switcher + summary strip (revert: git history pre FrameworkNav, or ask for "revert framework checkpoint"). */
function FrameworkNav({
  selectedId,
  statsById,
  framework,
  topBlocker,
  onSelect,
  onOpenTopBlocker,
  exportControl,
}: {
  selectedId: string;
  statsById: Record<string, FrameworkStats | undefined>;
  framework: (typeof FRAMEWORKS)[number];
  topBlocker: ControlRow | null;
  onSelect: (id: string) => void;
  onOpenTopBlocker: () => void;
  exportControl?: ReactNode;
}) {
  const stats = statsById[selectedId];
  const passRate = stats?.passRate ?? null;

  return (
    <header className="mb-2 border-b border-zinc-200/80 pb-3">
      <div
        className="inline-flex rounded-lg border border-zinc-200/80 bg-zinc-100/70 p-0.5"
        role="tablist"
        aria-label="Compliance framework"
      >
        {FRAMEWORKS.map((fw) => {
          const isActive = selectedId === fw.id;
          const tabStats = statsById[fw.id];
          const tabPct = tabStats?.passRate;
          return (
            <button
              key={fw.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(fw.id)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 sm:flex-none ${
                isActive
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {fw.label}
              {tabPct != null && (
                <span
                  className={`ml-1.5 tabular-nums font-bold ${
                    isActive ? passRateColor(tabPct) : "text-zinc-400"
                  }`}
                >
                  {tabPct}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      {(stats || exportControl) && (
        <div
          className={`mt-2.5 flex gap-4 ${stats ? "items-end justify-between" : "justify-end"}`}
        >
          {stats && (
            <div className="min-w-0 flex-1">
              <h2 className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                <span className="text-base font-bold text-zinc-950">{framework.label}</span>
                {passRate != null && (
                  <>
                    <span className={`text-base font-bold tabular-nums ${passRateColor(passRate)}`}>
                      {passRate}%
                    </span>
                    <span className="text-xs font-medium text-zinc-400">passing</span>
                  </>
                )}
              </h2>
              {stats.total === 0 && (
                <p className="mt-1 text-sm text-zinc-500">No controls mapped</p>
              )}
              {passRate != null && stats.total > 0 && (
                <div className="mt-2 flex max-w-xs items-center gap-2">
                  <div className="h-1.5 w-[14rem] shrink-0 overflow-hidden rounded-full bg-zinc-200/90">
                    <div
                      className={`h-full rounded-full transition-all ${passRate > 0 ? passRateBarColor(passRate) : "bg-transparent"}`}
                      style={{ width: `${Math.min(100, Math.max(0, passRate))}%` }}
                    />
                  </div>
                </div>
              )}
              {topBlocker && stats.failed > 0 && (
                <p className="mt-1.5 text-xs leading-snug text-zinc-600">
                  <span className="text-zinc-500">Top blocker: </span>
                  <button
                    type="button"
                    onClick={onOpenTopBlocker}
                    className="font-medium text-indigo-700 hover:text-indigo-900 hover:underline"
                  >
                    <span className="font-mono text-[11px] text-zinc-500">{topBlocker.control_id}</span>
                    {" "}
                    {shortControlTitle(topBlocker.title)}
                    <span className="tabular-nums text-red-600/90"> ({topBlocker.finding_count} findings)</span>
                  </button>
                </p>
              )}
            </div>
          )}
          {exportControl}
        </div>
      )}
    </header>
  );
}

export default function Controls() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlFramework = searchParams.get("framework");
  const urlControl = searchParams.get("control");
  const urlAccountId = searchParams.get("account_id");
  const [framework, setFramework] = useState(
    () => (urlFramework && FRAMEWORKS.some((f) => f.id === urlFramework) ? urlFramework : "soc2"),
  );
  const [selectedFamilyKey, setSelectedFamilyKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [periodKey, setPeriodKey] = useState<string | number>(90);
  const [asOf, setAsOf] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<Account[]>("/v1/accounts"),
  });

  const connectedAccount = accounts.data?.find((a) => a.status === "connected");
  const activeAccount =
    (urlAccountId && accounts.data?.find((a) => a.id === urlAccountId && a.status === "connected")) ||
    connectedAccount;
  const hasScanned = !!activeAccount?.last_scan_at;
  const activeFramework = FRAMEWORKS.find((fw) => fw.id === framework)!;

  const controls = useQuery({
    queryKey: ["controls", framework, activeAccount?.id],
    queryFn: () =>
      api<ControlRow[]>(
        `/v1/controls?framework=${framework}${activeAccount ? `&account_id=${activeAccount.id}` : ""}`
      ),
    enabled: !accounts.isLoading,
  });

  const deepLinkDone = useRef(false);
  useEffect(() => {
    deepLinkDone.current = false;
  }, [framework, urlControl]);

  useEffect(() => {
    if (!urlControl || !controls.data?.length || deepLinkDone.current) return;
    const match = controls.data.find((r) => r.control_id === urlControl);
    if (match) {
      deepLinkDone.current = true;
      setSelectedFamilyKey(controlFamily(framework, match.control_id).key);
      setExpanded(match.id);
    }
  }, [controls.data, urlControl, framework]);

  const openFindingsMeta = useQuery({
    queryKey: ["findings", "open", connectedAccount?.id, "controls-meta"],
    queryFn: () =>
      api<{ items: OpenFindingMeta[] }>(`/v1/findings?status=open&limit=500`),
    enabled: !!activeAccount && hasScanned,
    select: (data) => {
      const byId = new Map<string, OpenFindingMeta>();
      const countByCheck = new Map<string, number>();
      for (const f of data.items) {
        byId.set(f.id, f);
        countByCheck.set(f.check_id, (countByCheck.get(f.check_id) ?? 0) + 1);
      }
      return { byId, countByCheck };
    },
  });

  const findingMap = openFindingsMeta.data?.byId ?? new Map<string, OpenFindingMeta>();
  const findingCountByCheck = openFindingsMeta.data?.countByCheck ?? new Map<string, number>();

  const exportWindow = useMemo(() => {
    if (periodKey === "last_scan" && activeAccount?.last_scan_at) {
      return {
        period: 30,
        asOf: activeAccount.last_scan_at.slice(0, 10),
        label: "Last scan",
      };
    }
    const p = Number(periodKey);
    return {
      period: p,
      asOf: asOf.trim() || undefined,
      label: `Last ${p} days`,
    };
  }, [periodKey, asOf, activeAccount?.last_scan_at]);

  const evidenceCoverage = useQuery({
    queryKey: ["evidence-coverage", activeAccount?.id, exportWindow.period, exportWindow.asOf],
    queryFn: () => {
      const params = new URLSearchParams({
        period: String(exportWindow.period),
      });
      if (exportWindow.asOf) params.set("as_of", exportWindow.asOf);
      return api<EvidenceCoverage>(
        `/v1/accounts/${activeAccount!.id}/evidence-coverage?${params}`
      );
    },
    enabled: !!activeAccount && hasScanned,
  });

  useEffect(() => {
    if (!exportOpen) return;
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [exportOpen]);

  const soc2Stats = useFrameworkStats("soc2", connectedAccount?.id, hasScanned);
  const cisStats = useFrameworkStats("cis_aws_l1", connectedAccount?.id, hasScanned);
  const isoStats = useFrameworkStats("iso27001", connectedAccount?.id, hasScanned);

  const frameworkStatsById: Record<string, FrameworkStats | undefined> = {
    soc2: soc2Stats.data,
    cis_aws_l1: cisStats.data,
    iso27001: isoStats.data,
  };

  const rows = controls.data ?? [];
  const passed = rows.filter((r) => r.status === "pass").length;
  const failed = rows.filter((r) => r.status === "fail").length;
  const noData = rows.filter((r) => r.status === "no_data").length;
  const total = rows.length;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : null;

  const filteredRows = useMemo(
    () => (statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter)),
    [rows, statusFilter]
  );

  const groupedRows = useMemo(() => groupControls(filteredRows, framework), [filteredRows, framework]);
  const selectedGroup = groupedRows.find((group) => group.key === selectedFamilyKey) ?? groupedRows[0] ?? null;
  function openControl(ctrl: ControlRow) {
    setSelectedFamilyKey(controlFamily(framework, ctrl.control_id).key);
    setExpanded(ctrl.id);
  }

  const topBlocker = useMemo(() => {
    const failing = rows.filter((row) => row.status === "fail");
    if (failing.length === 0) return null;
    return failing.reduce((worst, row) => (row.finding_count > worst.finding_count ? row : worst));
  }, [rows]);

  async function downloadPack(opts?: { framework?: string; period?: number; asOf?: string }) {
    if (!activeAccount) return;
    setDownloading(true);
    try {
      const tok = token();
      const params = new URLSearchParams({
        framework: opts?.framework ?? framework,
        account_id: activeAccount.id,
        period: String(opts?.period ?? exportWindow.period),
      });
      const asOfVal = opts?.asOf ?? exportWindow.asOf;
      if (asOfVal) params.set("as_of", asOfVal);
      const res = await fetch(`${BASE}/v1/exports/evidence-pack?${params}`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vigil-evidence-${opts?.framework ?? framework}-${(asOfVal ?? new Date().toISOString().slice(0, 10))}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Download failed: " + String(e));
    } finally {
      setDownloading(false);
    }
  }

  if (!accounts.isLoading && !connectedAccount) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 py-20 text-center">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <svg className="h-7 w-7 text-zinc-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>
        <h2 className="mb-2 text-lg font-semibold text-zinc-900">Connect AWS to view compliance</h2>
        <p className="mb-6 max-w-sm text-sm leading-relaxed text-zinc-500">
          Map SOC 2, CIS, and ISO 27001 controls to your AWS posture and export auditor-ready evidence packs.
        </p>
        <a href="/accounts" className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">
          Connect AWS account
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-zinc-100/35">
    <div className="w-full px-8 py-8">
      <div className={`mb-4 ${exportOpen ? "relative z-[100]" : ""}`}>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950">Compliance</h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          {connectedAccount?.account_id && <span>Account {connectedAccount.account_id}</span>}
          {connectedAccount?.last_scan_at && (
            <span className="text-zinc-400">
              {connectedAccount?.account_id ? " · " : ""}
              Last scan {lastScanLabel(connectedAccount.last_scan_at)}
            </span>
          )}
        </p>
      </div>

      {!hasScanned && connectedAccount && !controls.isLoading && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/60 px-5 py-4 text-sm text-amber-900">
          <span className="font-semibold">Awaiting first scan.</span> Control pass/fail status appears after your account finishes scanning.
        </div>
      )}

      {controls.isLoading && <LoadingSkeleton />}

      {!controls.isLoading && connectedAccount && (
        <FrameworkNav
          selectedId={framework}
          statsById={frameworkStatsById}
          framework={activeFramework}
          topBlocker={topBlocker}
          onSelect={(id) => {
            setFramework(id);
            setSelectedFamilyKey(null);
            setExpanded(null);
          }}
          onOpenTopBlocker={() => {
            if (!topBlocker) return;
            setStatusFilter("fail");
            openControl(topBlocker);
          }}
          exportControl={
            <div ref={exportRef} className={`relative shrink-0 ${exportOpen ? "z-[101]" : ""}`}>
              <button
                type="button"
                onClick={() => setExportOpen((open) => !open)}
                aria-expanded={exportOpen}
                aria-haspopup="dialog"
                className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                  exportOpen
                    ? "border-indigo-300 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-200/60"
                    : "border-indigo-200 bg-indigo-50/60 text-indigo-800 hover:border-indigo-300 hover:bg-indigo-50"
                }`}
              >
                <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Generate Audit Package
              </button>
              {exportOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close evidence pack menu"
                    className="fixed inset-0 z-[100] cursor-default bg-zinc-950/15"
                    onClick={() => setExportOpen(false)}
                  />
                  <div
                    role="dialog"
                    aria-label="Generate Audit Package"
                    className="absolute right-0 top-full z-[102] mt-2 rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-lg shadow-zinc-950/10"
                  >
                    <EvidencePackExportPanel
                      frameworkLabel={activeFramework.label}
                      periodKey={periodKey}
                      onPeriodChange={setPeriodKey}
                      asOf={asOf}
                      onAsOfChange={setAsOf}
                      coverage={evidenceCoverage.data}
                      coverageLoading={evidenceCoverage.isFetching}
                      controlsEvaluated={total}
                      openFindings={rows.reduce((sum, r) => sum + r.finding_count, 0)}
                      passingCount={passed}
                      downloading={downloading}
                      onDownload={() => void downloadPack()}
                    />
                  </div>
                </>
              )}
            </div>
          }
        />
      )}

      {!controls.isLoading && total > 0 && (
        <div className="mb-3 space-y-2">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-zinc-200/80 bg-white p-1 shadow-sm shadow-zinc-950/[0.03]">
            {(
              [
                { id: "all" as const, label: "All", count: total },
                { id: "fail" as const, label: "Failing", count: failed },
                { id: "pass" as const, label: "Passing", count: passed },
                { id: "no_data" as const, label: "No data", count: noData },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setStatusFilter(f.id);
                  setExpanded(null);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  statusFilter === f.id
                    ? "bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200"
                    : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800"
                }`}
              >
                {f.label}
                <span className={statusFilter === f.id ? "text-indigo-500" : "text-zinc-400"}> · {f.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <section className="min-w-0">
          {!controls.isLoading && rows.length === 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center text-sm text-zinc-400 shadow-sm">
              No controls found for this framework.
            </div>
          )}
          {!controls.isLoading && rows.length > 0 && filteredRows.length === 0 && statusFilter !== "all" && (
            <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-400 shadow-sm">
              No controls match this filter.
            </div>
          )}

          {!controls.isLoading && groupedRows.length > 0 && selectedGroup && (
              <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-md shadow-zinc-950/[0.05] ring-1 ring-zinc-950/[0.03]">
                <div className="border-b border-zinc-100 bg-zinc-50/50 px-5 py-3.5">
                  <div
                    className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-zinc-200/70 bg-white p-1 shadow-sm shadow-zinc-950/[0.02]"
                    role="tablist"
                    aria-label="Control domains"
                  >
                    {groupedRows.map((group) => {
                      const isSelected = selectedGroup.key === group.key;
                      return (
                        <button
                          key={group.key}
                          type="button"
                          role="tab"
                          aria-selected={isSelected}
                          title={group.label}
                          onClick={() => {
                            setSelectedFamilyKey(group.key);
                            setExpanded(null);
                          }}
                          className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-all ${
                            isSelected
                              ? "bg-indigo-50 text-indigo-900 ring-1 ring-indigo-200/80"
                              : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
                          }`}
                        >
                          {shortFamilyLabel(group.label)}
                          <span
                            className={
                              group.failed > 0
                                ? "text-red-500/90"
                                : isSelected
                                  ? "text-indigo-500"
                                  : "text-zinc-400"
                            }
                          >
                            {" "}
                            · {group.rows.length}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="hidden grid-cols-[auto_auto_minmax(0,1fr)_3.5rem] items-center gap-4 border-b border-zinc-200 bg-zinc-50/60 px-5 py-2.5 sm:grid">
                  <span className="w-3.5" />
                  <span className="w-[72px] text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Status</span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Control</span>
                  <span className="text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                    Findings
                  </span>
                </div>

                <div className="divide-y divide-zinc-100/90">
                  {selectedGroup.rows.map((ctrl) => {
                    const isExpanded = expanded === ctrl.id;
                    const meta = controlRowMetadata(ctrl, findingMap, connectedAccount?.last_scan_at ?? null);
                    return (
                      <div key={ctrl.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            const scrollY = window.scrollY;
                            setExpanded(isExpanded ? null : ctrl.id);
                            requestAnimationFrame(() => window.scrollTo(0, scrollY));
                          }}
                          className={`grid w-full grid-cols-1 gap-3 border-l-2 py-4 pl-5 pr-5 text-left transition-colors sm:grid-cols-[auto_auto_minmax(0,1fr)_3.5rem] sm:items-center sm:gap-4 ${statusAccent[ctrl.status]} ${
                            isExpanded ? statusExpandedBg[ctrl.status] : "hover:bg-zinc-50/70"
                          }`}
                        >
                          <svg
                            className={`hidden h-3.5 w-3.5 shrink-0 transition-transform duration-150 sm:block ${isExpanded ? "text-zinc-600" : "-rotate-90 text-zinc-400"}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>

                          <div className="sm:w-[72px]">
                            <StatusIndicator status={ctrl.status} />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="font-mono text-xs font-semibold text-zinc-500">{ctrl.control_id}</span>
                              <span className="text-sm font-semibold leading-snug text-zinc-900">
                                {shortControlTitle(ctrl.title)}
                              </span>
                              <CoverageTierBadge tier={ctrl.coverage_tier} label={ctrl.coverage_label} />
                            </div>
                            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-zinc-500">{meta}</p>
                          </div>

                          <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-center sm:bg-zinc-50/30">
                            <svg
                              className={`h-3.5 w-3.5 shrink-0 text-zinc-400 sm:hidden ${isExpanded ? "" : "-rotate-90"}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                            <FindingCountBadge count={ctrl.finding_count} status={ctrl.status} />
                          </div>
                        </button>

                        {isExpanded && (
                          <div
                            className={`space-y-3 border-t border-zinc-100/80 px-5 pb-5 pt-4 sm:pl-[4.75rem] ${statusExpandedBg[ctrl.status]}`}
                          >
                            <ControlAuditEvidenceBlock
                              control={ctrl}
                              periodDays={exportWindow.period}
                              coverage={evidenceCoverage.data}
                            />
                            <NarrativeDetailBlock control={ctrl} />

                            {ctrl.check_ids.length === 0 ? (
                              <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 px-3.5 py-2.5 text-xs leading-relaxed text-zinc-600">
                                No automated Vigil checks map to this control yet — attest manually (e.g. IAM users
                                only inherit access via groups or roles).
                              </p>
                            ) : (
                              <MappedChecksList
                                checkIds={ctrl.check_ids}
                                checkTiers={ctrl.check_tiers}
                                checkEvidenceClasses={ctrl.check_evidence_classes}
                                findingCountByCheck={findingCountByCheck}
                              />
                            )}

                            {activeAccount && hasScanned && ctrl.check_ids.length > 0 && (
                              <DisclosureSection title="Advanced evidence details">
                                <EvidencePreviewPanel
                                  controlId={ctrl.control_id}
                                  accountId={activeAccount.id}
                                  period={exportWindow.period}
                                />
                              </DisclosureSection>
                            )}

                            {activeAccount && hasScanned && (
                              <ControlHistoryPanel
                                controlId={ctrl.control_id}
                                framework={framework}
                                accountId={activeAccount.id}
                                period={exportWindow.period}
                              />
                            )}

                            {(ctrl.narrative || ctrl.description || ctrl.short_answer || ctrl.long_answer) ? (
                              <QuestionnaireAnswerBlock control={ctrl} periodDays={exportWindow.period} />
                            ) : (
                              <p className="text-xs leading-relaxed text-zinc-600">{controlSummary(ctrl)}</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
        </section>
    </div>
    </div>
  );
}
