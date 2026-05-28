import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
  role_arn: string | null;
  cfn_launch_url: string;
  cfn_template_url: string;
  cfn_cli_command: string;
  last_scan_at: string | null;
};

type Finding = { id: string; account_id: string; severity: string; status: string };

type FindingStats = { critHigh: number; medium: number; open: number };

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

function CopyTextButton({
  label,
  copiedLabel = "Copied",
  text,
  className = "",
}: {
  label: string;
  copiedLabel?: string;
  text: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`text-xs font-semibold transition ${
        copied ? "text-emerald-600" : "text-indigo-600 hover:text-indigo-800"
      } ${className}`}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}

function CopyInputField({
  label,
  value,
  readOnly = true,
  placeholder,
  onChange,
  validation,
}: {
  label: string;
  value: string;
  readOnly?: boolean;
  placeholder?: string;
  onChange?: (v: string) => void;
  validation?: "idle" | "pending" | "success" | "error";
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  const ring =
    validation === "success"
      ? "ring-emerald-500/30 focus-within:ring-emerald-500/40"
      : validation === "error"
        ? "ring-red-500/30 focus-within:ring-red-500/40"
        : validation === "pending"
          ? "ring-indigo-500/30 focus-within:ring-indigo-500/40"
          : "ring-zinc-200/80 focus-within:ring-indigo-500/30";

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-zinc-600">{label}</label>
      <div
        className={`flex items-center gap-2 rounded-lg bg-zinc-50/80 px-3 py-2.5 ring-1 ring-inset transition ${ring}`}
      >
        <input
          type="text"
          readOnly={readOnly}
          value={value}
          placeholder={placeholder}
          onChange={readOnly ? undefined : (e) => onChange?.(e.target.value)}
          className={`min-w-0 flex-1 bg-transparent font-mono text-sm text-zinc-900 outline-none placeholder:text-zinc-400 ${
            readOnly ? "cursor-default" : ""
          }`}
        />
        {readOnly && (
          <button
            type="button"
            onClick={copy}
            className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold transition ${
              copied
                ? "bg-emerald-50 text-emerald-700"
                : "bg-white text-zinc-600 shadow-sm ring-1 ring-zinc-200/80 hover:text-zinc-900"
            }`}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      {validation === "success" && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-600">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Verified
        </p>
      )}
      {validation === "error" && (
        <p className="mt-1.5 text-xs text-red-600">Invalid ARN — check stack Outputs and try again</p>
      )}
      {validation === "pending" && (
        <p className="mt-1.5 text-xs text-indigo-600">Verifying connection…</p>
      )}
    </div>
  );
}

const metadataFieldShell =
  "inline-flex w-full items-center gap-1.5 rounded-md bg-white px-2 py-1.5 ring-1 ring-zinc-200/80";

function CompactTokenField({ value, maxWidth = "max-w-xs" }: { value: string; maxWidth?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={`${metadataFieldShell} ${maxWidth}`}>
      <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-800">{value}</code>
      <button
        type="button"
        onClick={copy}
        title={copied ? "Copied" : "Copy"}
        className={`shrink-0 rounded p-1 transition ${
          copied ? "text-emerald-600" : "text-zinc-400 hover:bg-zinc-50 hover:text-zinc-700"
        }`}
      >
        {copied ? (
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.75}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        )}
      </button>
    </div>
  );
}

function postureBarTone(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-orange-500";
}

function frameworkScoreTextClass(score: number | null | undefined): string {
  if (score == null) return "text-zinc-400";
  if (score >= 80) return "text-emerald-700";
  if (score >= 40) return "text-amber-700";
  return "text-orange-600";
}

function complianceRingColor(score: number): { arc: string; text: string } {
  if (score >= 80) return { arc: "text-emerald-500", text: "text-emerald-700" };
  if (score >= 40) return { arc: "text-amber-400", text: "text-amber-700" };
  return { arc: "text-orange-500", text: "text-orange-600" };
}

/** Donut only — no caption (used inside expanded security posture). */
function ComplianceRingGraphic({ score, size = 46 }: { score: number | null; size?: number }) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  if (score == null) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-full border border-dashed border-zinc-200/80 bg-zinc-50/50"
        style={{ width: size, height: size }}
      >
        <span className="text-xs font-medium text-zinc-300">—</span>
      </div>
    );
  }

  const colors = complianceRingColor(score);
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} className="-rotate-90">
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
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-sm font-semibold tabular-nums leading-none ${colors.text}`}>
          {score}%
        </span>
      </div>
    </div>
  );
}

function SecurityPostureDetail({
  score,
  soc2,
  cis,
  iso,
  loading,
  hasScanned,
}: {
  score: number | null;
  soc2: number | null | undefined;
  cis: number | null | undefined;
  iso: number | null | undefined;
  loading?: boolean;
  hasScanned: boolean;
}) {
  if (!hasScanned && !loading) {
    return (
      <p className="text-sm text-zinc-500">Run a scan to compute security posture.</p>
    );
  }

  if (loading) {
    return (
      <div className="flex items-start gap-4" aria-hidden>
        <div className="h-[46px] w-[46px] shrink-0 animate-pulse rounded-full bg-zinc-100" />
        <div className="min-w-0 pt-0.5">
          <div className="h-3.5 w-28 animate-pulse rounded bg-zinc-200/70" />
          <div className="mt-2.5 h-2 w-56 max-w-full animate-pulse rounded-full bg-zinc-100" />
          <div className="mt-2 h-3 w-52 animate-pulse rounded bg-zinc-100" />
        </div>
      </div>
    );
  }

  const benchmarks = [
    { label: "SOC2", score: soc2 },
    { label: "CIS", score: cis },
    { label: "ISO", score: iso },
  ];

  return (
    <div
      className="flex items-start gap-4"
      role="group"
      aria-label={score != null ? `Security posture ${score}% passing` : "Security posture"}
    >
      <ComplianceRingGraphic score={score} />
      <div className="min-w-0 pt-0.5">
        <p className="text-xs font-medium text-zinc-600">Security posture</p>
        {score != null && (
          <div
            className="mt-2 h-2 w-56 max-w-full overflow-hidden rounded-full bg-zinc-100"
            role="progressbar"
            aria-valuenow={score}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${postureBarTone(score)}`}
              style={{ width: `${score}%` }}
            />
          </div>
        )}
        <p className="mt-2 text-xs tabular-nums text-zinc-500">
          {benchmarks.map((b, i) => (
            <span key={b.label}>
              {i > 0 && <span className="text-zinc-300"> · </span>}
              <span className="text-zinc-500">{b.label} </span>
              <span className={`font-medium ${frameworkScoreTextClass(b.score)}`}>
                {b.score != null ? `${b.score}%` : "—"}
              </span>
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

function DetailCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider leading-none text-zinc-400">{label}</p>
      <div className="mt-1.5 flex min-h-[34px] items-center">{children}</div>
    </div>
  );
}

const ghostBtn =
  "inline-flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:border-zinc-200 hover:bg-white hover:text-zinc-900 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50";

const dangerGhostBtn =
  "inline-flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-red-600 transition hover:border-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50";

function AccountDetailsPanel({
  acc,
  soc2,
  cis,
  iso,
  complianceAvg,
  hasScanned,
  complianceLoading,
  isScanActive,
  scanError,
  showUpdateArn,
  roleArn,
  setRoleArn,
  verify,
  onUpdateRole,
  onCancelUpdate,
  onRemove,
  removePending,
}: {
  acc: Account;
  soc2: number | null | undefined;
  cis: number | null | undefined;
  iso: number | null | undefined;
  complianceAvg: number | null;
  hasScanned: boolean;
  complianceLoading: boolean;
  isScanActive: boolean;
  scanError: string | null;
  showUpdateArn: boolean;
  roleArn: string;
  setRoleArn: (v: string) => void;
  verify: {
    mutate: () => void;
    isPending: boolean;
    isError: boolean;
    isSuccess: boolean;
    reset: () => void;
  };
  onUpdateRole: () => void;
  onCancelUpdate: () => void;
  onRemove: () => void;
  removePending: boolean;
}) {
  const roleDisplay = acc.role_arn ?? (acc.account_id ? `arn:aws:iam::${acc.account_id}:role/VigilReadOnly` : null);

  if (showUpdateArn) {
    return (
      <div className="space-y-3 px-4 py-3">
        <p className="text-sm font-medium text-zinc-900">Update IAM role</p>
        <p className="text-xs text-zinc-500">Paste the new Role ARN from your CloudFormation stack Outputs.</p>
        <CopyInputField label="External ID" value={acc.external_id} />
        <CopyInputField
          label="Role ARN"
          value={roleArn}
          readOnly={false}
          placeholder="arn:aws:iam::123456789012:role/VigilReadOnly"
          onChange={setRoleArn}
          validation={
            verify.isPending ? "pending" : verify.isError ? "error" : verify.isSuccess ? "success" : "idle"
          }
        />
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={() => verify.mutate()}
            disabled={verify.isPending || !roleArn.trim()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {verify.isPending ? "Verifying…" : "Save & verify"}
          </button>
          <button onClick={onCancelUpdate} className={ghostBtn}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="divide-y divide-zinc-200/60">
      {scanError && (
        <div className="bg-red-50/80 px-4 py-2.5 text-xs text-red-700">
          <span className="font-medium">Last scan failed</span>
          <div className="mt-0.5 break-words">{scanError}</div>
        </div>
      )}

      <div className="grid gap-4 px-4 py-3 sm:grid-cols-2">
        <DetailCell label="External ID">
          <CompactTokenField value={acc.external_id} />
        </DetailCell>
        <DetailCell label="Role ARN">
          {roleDisplay ? (
            <CompactTokenField value={roleDisplay} maxWidth="max-w-sm" />
          ) : (
            <div className={metadataFieldShell}>
              <span className="text-[11px] text-zinc-400">—</span>
            </div>
          )}
        </DetailCell>
      </div>

      <div className="border-t border-zinc-200/60 px-4 py-4">
        <SecurityPostureDetail
          score={complianceAvg}
          soc2={soc2}
          cis={cis}
          iso={iso}
          loading={complianceLoading}
          hasScanned={hasScanned}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200/60 px-4 py-3">
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={onUpdateRole} disabled={isScanActive} className={ghostBtn}>
            Update IAM role
          </button>
          <a href={acc.cfn_launch_url} target="_blank" rel="noreferrer" className={ghostBtn}>
            Re-deploy stack
          </a>
        </div>
        <button type="button" onClick={onRemove} disabled={removePending} className={dangerGhostBtn}>
          Disconnect account
        </button>
      </div>
    </div>
  );
}

function CliCodeBlock({ command }: { command: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-900"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Show CLI command
      </button>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg bg-zinc-950 shadow-inner">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">bash</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-[11px] font-medium text-zinc-500 transition hover:text-zinc-300"
          >
            Collapse
          </button>
          <button
            type="button"
            onClick={copy}
            className={`rounded px-2 py-0.5 text-[11px] font-semibold transition ${
              copied ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto whitespace-pre px-4 py-3 font-mono text-[12px] leading-relaxed text-zinc-300">
        <code>{command}</code>
      </pre>
    </div>
  );
}

type DeployTab = "console" | "cli" | "terraform";

function DeployMethodTabs({ acc }: { acc: Account }) {
  const [tab, setTab] = useState<DeployTab>("console");

  const tabs: { id: DeployTab; label: string }[] = [
    { id: "console", label: "Console Setup" },
    { id: "cli", label: "CLI" },
    { id: "terraform", label: "Terraform" },
  ];

  return (
    <div>
      <div className="flex gap-1 rounded-lg bg-zinc-100/80 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              tab === t.id
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "console" && (
          <div className="space-y-3">
            <a
              href={acc.cfn_launch_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800"
            >
              Launch CloudFormation Stack
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            <div className="flex items-center gap-3">
              <CopyTextButton label="View template" text={acc.cfn_template_url} className="text-sm" />
            </div>
            <p className="text-sm text-zinc-500">
              This deploys a read-only role into your AWS account.
            </p>
          </div>
        )}
        {tab === "cli" && <CliCodeBlock command={acc.cfn_cli_command} />}
        {tab === "terraform" && (
          <div className="rounded-lg bg-zinc-50 px-4 py-6 text-center">
            <p className="text-sm font-medium text-zinc-700">Terraform module</p>
            <p className="mt-1 text-sm text-zinc-500">Coming soon — use Console or CLI for now.</p>
          </div>
        )}
      </div>
    </div>
  );
}

const ONBOARDING_STEPS = [
  { n: 1, title: "Deploy Stack", short: "Launch CloudFormation in your AWS account" },
  { n: 2, title: "Copy Role ARN", short: "From the stack Outputs tab after deploy completes" },
  { n: 3, title: "Verify Connection", short: "Paste the Role ARN to connect Vigil" },
] as const;

function OnboardingProgress({
  activeStep,
  onStepChange,
}: {
  activeStep: number;
  onStepChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-0">
      {ONBOARDING_STEPS.map((step, i) => {
        const isActive = activeStep === step.n;
        const isPast = activeStep > step.n;
        return (
          <div key={step.n} className="flex items-center">
            <button
              type="button"
              onClick={() => onStepChange(step.n)}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition sm:px-3 ${
                isActive
                  ? "bg-white shadow-sm ring-1 ring-zinc-200/80"
                  : isPast
                    ? "opacity-70 hover:opacity-100"
                    : "opacity-45 hover:opacity-70"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  isActive
                    ? "bg-zinc-900 text-white"
                    : isPast
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-zinc-200 text-zinc-500"
                }`}
              >
                {isPast ? (
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step.n
                )}
              </span>
              <span
                className={`hidden text-sm font-semibold sm:inline ${
                  isActive ? "text-zinc-900" : "text-zinc-500"
                }`}
              >
                {step.title}
              </span>
            </button>
            {i < ONBOARDING_STEPS.length - 1 && (
              <svg
                className="mx-1 hidden h-4 w-4 shrink-0 text-zinc-300 sm:block"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SetupWizard({
  acc,
  roleArn,
  setRoleArn,
  verify,
  onRemove,
  removePending,
}: {
  acc: Account;
  roleArn: string;
  setRoleArn: (v: string) => void;
  verify: { mutate: () => void; isPending: boolean; isError: boolean; isSuccess: boolean; error: unknown };
  onRemove: () => void;
  removePending: boolean;
}) {
  const [activeStep, setActiveStep] = useState(1);

  const arnValidation: "idle" | "pending" | "success" | "error" = verify.isPending
    ? "pending"
    : verify.isError
      ? "error"
      : verify.isSuccess
        ? "success"
        : "idle";

  return (
    <div className="bg-zinc-50/60 px-5 py-5 sm:px-6">
      <div className="mb-5">
        <h3 className="text-base font-semibold tracking-tight text-zinc-900">AWS Account Setup</h3>
        <p className="mt-0.5 text-sm text-zinc-500">
          Connect your AWS account securely using a read-only IAM role.
        </p>
      </div>

      <OnboardingProgress activeStep={activeStep} onStepChange={setActiveStep} />

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_280px] lg:gap-8">
        <div className="min-w-0">
          {activeStep === 1 && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium text-zinc-900">Deploy the read-only role</p>
                <p className="mt-0.5 text-sm text-zinc-500">{ONBOARDING_STEPS[0].short}</p>
              </div>
              <DeployMethodTabs acc={acc} />
              <CopyInputField label="External ID" value={acc.external_id} />
              <button
                type="button"
                onClick={() => setActiveStep(2)}
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-800"
              >
                Stack deployed → Continue
              </button>
            </div>
          )}

          {activeStep === 2 && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-zinc-900">Copy the Role ARN</p>
                <p className="mt-0.5 text-sm text-zinc-500">{ONBOARDING_STEPS[1].short}</p>
              </div>
              <ol className="space-y-2 text-sm text-zinc-600">
                <li className="flex gap-2">
                  <span className="font-semibold text-zinc-400">1.</span>
                  Open CloudFormation in the AWS Console and select your <strong className="font-medium text-zinc-800">VigilReadOnly</strong> stack
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-zinc-400">2.</span>
                  Go to the <strong className="font-medium text-zinc-800">Outputs</strong> tab
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-zinc-400">3.</span>
                  Copy the <strong className="font-medium text-zinc-800">RoleArn</strong> value
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setActiveStep(3)}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
              >
                I have the Role ARN
              </button>
            </div>
          )}

          {activeStep === 3 && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-zinc-900">Verify connection</p>
                <p className="mt-0.5 text-sm text-zinc-500">{ONBOARDING_STEPS[2].short}</p>
              </div>
              <CopyInputField label="External ID" value={acc.external_id} />
              <CopyInputField
                label="Role ARN"
                value={roleArn}
                readOnly={false}
                placeholder="arn:aws:iam::123456789012:role/VigilReadOnly"
                onChange={setRoleArn}
                validation={arnValidation}
              />
              <button
                onClick={() => verify.mutate()}
                disabled={verify.isPending || !roleArn.trim()}
                className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {verify.isPending ? "Verifying…" : "Verify connection"}
              </button>
              {verify.error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {(verify.error as Error).message}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="hidden space-y-3 lg:block">
          {ONBOARDING_STEPS.map((step) => {
            const isActive = activeStep === step.n;
            return (
              <div
                key={step.n}
                className={`rounded-lg px-3 py-2.5 transition ${
                  isActive ? "bg-white shadow-sm" : "opacity-50"
                }`}
              >
                <p className="text-xs font-semibold text-zinc-900">
                  {step.n}. {step.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{step.short}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex justify-end border-t border-zinc-200/60 pt-4">
        <button
          type="button"
          onClick={onRemove}
          disabled={removePending}
          className="text-xs font-medium text-zinc-400 transition hover:text-red-600"
        >
          Remove account
        </button>
      </div>
    </div>
  );
}

function MetricPills({ stats }: { stats: FindingStats }) {
  const pills = [
    { value: stats.critHigh, label: "Critical", accent: stats.critHigh > 0 },
    { value: stats.medium, label: "Medium", accent: false },
    { value: stats.open, label: "Open", accent: false },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pills.map((p) => (
        <span
          key={p.label}
          className="inline-flex items-baseline gap-1 rounded-full bg-zinc-100/90 px-2.5 py-1 text-xs"
        >
          <span className={`font-semibold tabular-nums ${p.accent ? "text-orange-600" : "text-zinc-800"}`}>
            {p.value}
          </span>
          <span className="text-zinc-500">{p.label}</span>
        </span>
      ))}
    </div>
  );
}

const cardClass =
  "overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_12px_rgba(0,0,0,0.04)] transition-[box-shadow,border-color] duration-200 hover:border-zinc-300 hover:shadow-[0_2px_8px_rgba(0,0,0,0.07),0_8px_20px_rgba(0,0,0,0.05)]";

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

  const hasStats = connected && hasScanned && !!stats;
  const complianceAvg = averageCompliance(soc2.data, cis.data, iso.data);
  const complianceLoading = soc2.isLoading || cis.isLoading || iso.isLoading;

  return (
    <div className={`group ${cardClass} ${!connected ? "border-l-[3px] border-l-amber-400" : ""}`}>
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FF9900]/10">
            <AwsIcon className="h-6 w-6 object-contain" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-zinc-900">{acc.label}</h2>
            {connected && acc.account_id ? (
              <p className="font-mono text-xs tabular-nums text-zinc-500">{acc.account_id}</p>
            ) : (
              <p className="text-xs text-zinc-500">Setup required</p>
            )}
            {connected && (
              <div className="mt-0.5">
                <ScanFreshnessBadge iso={acc.last_scan_at} isScanActive={isScanActive} />
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {hasStats && stats && (
            <div className="hidden md:block">
              <MetricPills stats={stats} />
            </div>
          )}

          {connected && (
            <button
              onClick={() => triggerScan(acc.id)}
              disabled={isScanActive}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
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

          {!connected && (
            <button
              type="button"
              onClick={onToggle}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-zinc-900 px-3 text-xs font-semibold text-white transition hover:bg-zinc-800"
            >
              {expanded ? "Hide setup" : "Continue setup"}
            </button>
          )}
        </div>
      </div>

      {hasStats && stats && (
        <div className="border-t border-zinc-100/80 px-4 py-2 md:hidden">
          <MetricPills stats={stats} />
        </div>
      )}

      {connected && isScanActive && (
        <div className="border-t border-zinc-100/80 px-4 pb-3 pt-2">
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
        <div className="border-t border-zinc-100/80 bg-zinc-50/40 px-4 py-2.5 text-center text-xs text-zinc-500">
          Run a scan to populate findings and compliance scores.
        </div>
      )}

      {connected && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className={`flex w-full items-center justify-between border-t px-4 py-2 text-left transition ${
            expanded
              ? "border-zinc-200/80 bg-zinc-100/50"
              : "border-zinc-100/80 bg-zinc-50/30 hover:bg-zinc-50/60"
          }`}
        >
          <span className="text-xs font-medium text-zinc-600">Details</span>
          <svg
            className={`h-4 w-4 text-zinc-400 transition-transform duration-300 ease-out ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          connected && expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          {connected && (
            <div className="border-t border-zinc-200/60 bg-zinc-50/50">
              <AccountDetailsPanel
                acc={acc}
                soc2={soc2.data}
                cis={cis.data}
                iso={iso.data}
                complianceAvg={complianceAvg}
                hasScanned={hasScanned}
                complianceLoading={complianceLoading}
                isScanActive={isScanActive}
                scanError={
                  scanStatus === "error" && scanRun.data?.error
                    ? `${scanRun.data.error_type ? `(${scanRun.data.error_type}) ` : ""}${scanRun.data.error}`
                    : null
                }
                showUpdateArn={showUpdateArn}
                roleArn={roleArn}
                setRoleArn={setRoleArn}
                verify={verify}
                onUpdateRole={() => setShowUpdateArn(true)}
                onCancelUpdate={() => {
                  setShowUpdateArn(false);
                  setRoleArn("");
                  verify.reset();
                }}
                onRemove={() => setShowRemoveConfirm(true)}
                removePending={remove.isPending}
              />
            </div>
          )}
        </div>
      </div>

      {expanded && !connected && (
        <SetupWizard
          acc={acc}
          roleArn={roleArn}
          setRoleArn={setRoleArn}
          verify={verify}
          onRemove={() => setShowRemoveConfirm(true)}
          removePending={remove.isPending}
        />
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
        confirmLabel="Disconnect account"
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

  const tiles: { label: string; value: number; gradient: string }[] = [
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
      gradient: "from-white to-zinc-50/90",
    },
    {
      label: "Accounts at risk",
      value: needsAttention,
      gradient: "from-white to-zinc-50/90",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <div
          key={t.label}
          className={`rounded-xl border border-zinc-200 bg-gradient-to-br px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[box-shadow,border-color] duration-200 hover:border-zinc-300 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] ${t.gradient}`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            {t.label}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">
            {t.value}
          </p>
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
