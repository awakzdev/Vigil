import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

type IaCResponse = {
  iac_status: string;
  reason?: string;
  terraform?: string | null;
  cloudformation?: string | null;
  cli?: string[];
  hints?: string[];
  pr_automation?: {
    available: boolean;
    github_connected?: boolean;
    gitlab_connected?: boolean;
    providers?: string[];
    repos: { full_name: string; default_branch: string }[];
    note: string;
  };
  apply_paths?: {
    terraform_pr: boolean;
    terraform_generic: boolean;
    customer_automation: boolean;
  };
  ssm_remediation?: SsmRemediationMeta;
};

type SsmRemediationMeta = {
  module_id: string;
  module_label: string;
  module_enabled: boolean;
  module_deployed: boolean;
  action: string | null;
  action_label: string;
  execution: string;
  automation_role_name: string;
  automation_region: string;
  runbook?: { document_name: string; owner: string; note?: string } | null;
  requires_vigil_document: boolean;
};

type DispatchResponse = {
  plan: Record<string, unknown>;
  plan_id?: string;
  automation_region?: string;
  document_name?: string;
  resource_region?: string;
  iam_inline_policy?: Record<string, unknown>;
  automation_execution_id?: string | null;
  automation_error?: string | null;
  prepared?: boolean;
  executed?: boolean;
  cli: { put_events?: string; start_automation?: string };
  cfn_template_url: string;
  instructions: string[];
};

type RunnerStatus = {
  ready: boolean;
  automation_region: string;
  blockers: string[];
  warnings: string[];
  hints: string[];
  document?: { name: string; exists: boolean; status?: string | null };
};

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-zinc-600">{label}</span>
        <button
          type="button"
          className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
          onClick={() => {
            void navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-64 overflow-auto rounded-lg border border-zinc-200 bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-100">
        {text}
      </pre>
    </div>
  );
}

function versionControlPrLabel(providers: string[]): string {
  if (providers.length > 1) return "Version control PR";
  if (providers[0] === "gitlab") return "GitLab merge request";
  return "Git PR";
}

function SsmDetail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-200/70 bg-zinc-50/70 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{label}</dt>
      <dd className="mt-1 truncate text-[12px] font-medium text-zinc-800">{children}</dd>
    </div>
  );
}

function SsmStatusBadge({ tone, children }: { tone: "ready" | "loading" | "blocked" | "failed" | "running"; children: React.ReactNode }) {
  const toneClass = {
    ready: "bg-emerald-50 text-emerald-800 ring-emerald-200/80",
    loading: "bg-zinc-100 text-zinc-600 ring-zinc-200/80",
    blocked: "bg-amber-50 text-amber-900 ring-amber-200/80",
    failed: "bg-amber-50 text-amber-900 ring-amber-200/80",
    running: "bg-indigo-50 text-indigo-800 ring-indigo-200/80",
  }[tone];

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${toneClass}`}>
      {children}
    </span>
  );
}

function SsmRemediationPanel({
  findingId,
  checkId,
  accountId,
  ssm,
}: {
  findingId: string;
  checkId: string;
  accountId: string | null;
  ssm: SsmRemediationMeta;
}) {
  const [dispatch, setDispatch] = useState<DispatchResponse | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const { data: runnerStatus, isLoading: runnerLoading } = useQuery({
    queryKey: ["remediation-runner-status", accountId, checkId],
    queryFn: () =>
      api<RunnerStatus>(
        `/v1/accounts/${accountId}/remediation-runner/status?check_id=${encodeURIComponent(checkId)}`,
      ),
    enabled: !!accountId && ssm.module_enabled,
    staleTime: 60_000,
  });

  const startMutation = useMutation({
    mutationFn: () =>
      api<DispatchResponse>(`/v1/findings/${findingId}/remediation/dispatch`, {
        method: "POST",
        body: JSON.stringify({ execute: true }),
      }),
    onSuccess: (res) => setDispatch(res),
  });

  useEffect(() => {
    setDispatch(null);
  }, [findingId]);

  if (!ssm.module_enabled) {
    return (
      <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-zinc-900">SSM automation unavailable</p>
            <p className="mt-1 text-[12px] leading-relaxed text-amber-950">
              Enable <span className="font-semibold">{ssm.module_label}</span> in the AWS connector before running this fix.
            </p>
          </div>
          <SsmStatusBadge tone="blocked">Setup needed</SsmStatusBadge>
        </div>
        <Link
          to="/accounts"
          className="mt-3 inline-flex rounded-lg bg-zinc-900 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-zinc-800"
        >
          Update connector
        </Link>
      </div>
    );
  }

  const ready = runnerStatus?.ready === true;
  const running = startMutation.isPending;
  const started = Boolean(dispatch?.automation_execution_id);
  const startFailed = Boolean(dispatch?.automation_error);
  const documentName = ssm.runbook?.document_name ?? "Vigil remediation plan";
  const documentOwner = ssm.runbook?.owner === "aws" ? "AWS-owned" : "Vigil";

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-sm shadow-zinc-900/[0.03]">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 bg-zinc-50/80 px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold text-zinc-900">Automated fix</p>
            <p className="mt-0.5 text-[12px] text-zinc-500">AWS Systems Manager Automation</p>
          </div>
          {runnerLoading ? (
            <SsmStatusBadge tone="loading">Checking</SsmStatusBadge>
          ) : startFailed ? (
            <SsmStatusBadge tone="failed">Blocked</SsmStatusBadge>
          ) : started ? (
            <SsmStatusBadge tone="running">Running</SsmStatusBadge>
          ) : ready ? (
            <SsmStatusBadge tone="ready">Ready</SsmStatusBadge>
          ) : (
            <SsmStatusBadge tone="blocked">Not ready</SsmStatusBadge>
          )}
        </div>

        <div className="space-y-3 px-4 py-3.5">
          {runnerLoading && (
            <p className="text-[12px] text-zinc-500">Checking SSM remediation in your account…</p>
          )}

          {!runnerLoading && !ready && runnerStatus && (
            <div className="rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-2.5 text-[12px] leading-relaxed text-amber-950">
              <p className="font-semibold">SSM automation is not ready in this account.</p>
              {runnerStatus.blockers.map((b) => (
                <p key={b} className="mt-1 break-words">{b}</p>
              ))}
              <Link to="/accounts" className="mt-2 inline-flex text-[12px] font-semibold text-indigo-700 underline">
                Update AWS connector
              </Link>
            </div>
          )}

          {!runnerLoading && ready && !started && !startFailed && (
            <>
              <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/60 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">What will run</p>
                <p className="mt-1 text-[12px] leading-relaxed text-zinc-700">
                  Signed remediation plan. You explicitly start the execution; Vigil will not auto-run fixes.
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-2">
                <SsmDetail label="Action">{ssm.action_label}</SsmDetail>
                <SsmDetail label="Region">{ssm.automation_region}</SsmDetail>
                <SsmDetail label="Runbook">
                  <span className="font-mono" title={`${documentOwner} · ${documentName}`}>
                    {documentOwner} · {documentName}
                  </span>
                </SsmDetail>
                <SsmDetail label="Role">
                  <span className="font-mono" title={ssm.automation_role_name}>{ssm.automation_role_name}</span>
                </SsmDetail>
              </dl>

              <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  disabled={running || !accountId}
                  onClick={() => startMutation.mutate()}
                  className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-[12px] font-semibold text-white shadow-sm shadow-zinc-900/10 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {running ? "Starting…" : "Start remediation"}
                </button>
                <p className="text-[11px] leading-relaxed text-zinc-500 sm:max-w-[16rem] sm:text-right">
                  Review Console or CLI first when the change needs human context.
                </p>
              </div>
            </>
          )}

          {started && (
            <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/70 px-3 py-2.5 text-[12px]">
              <p className="font-semibold text-emerald-950">Execution dispatched</p>
              <p className="mt-1 break-all font-mono text-[11px] text-zinc-700">
                {dispatch!.automation_execution_id}
              </p>
              <p className="mt-1 text-zinc-600">Status is in progress. Refresh below or re-scan to verify the finding.</p>
              <button
                type="button"
                disabled={running}
                onClick={() => startMutation.mutate()}
                className="mt-2 text-[11px] font-medium text-indigo-700 underline disabled:opacity-50"
              >
                Start again
              </button>
            </div>
          )}

          {startFailed && (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2.5 text-[12px] text-amber-950">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">Execution did not start</p>
                {dispatch?.plan_id && (
                  <span className="shrink-0 font-mono text-[10px] text-amber-800/70">
                    plan {dispatch.plan_id.slice(0, 8)}…
                  </span>
                )}
              </div>
              <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-amber-200/70 bg-white/60 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-amber-950">
                {dispatch!.automation_error}
              </pre>
              <button
                type="button"
                disabled={running}
                onClick={() => startMutation.mutate()}
                className="mt-2 rounded-lg border border-amber-300/70 bg-white px-3 py-1.5 text-[12px] font-semibold text-amber-950 transition hover:bg-amber-50 disabled:opacity-50"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </section>

      <ExecutionStatus findingId={findingId} />

      {dispatch && (
        <div className="overflow-hidden rounded-xl border border-zinc-200/70 bg-white shadow-sm shadow-zinc-900/[0.02]">
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500"
          >
            Technical details
            <span aria-hidden>{advancedOpen ? "−" : "+"}</span>
          </button>
          {advancedOpen && (
            <div className="space-y-2 border-t border-zinc-200/60 px-4 py-3">
              {dispatch.iam_inline_policy && (
                <CopyBlock
                  label="Scoped policy (VigilRemediationRole module)"
                  text={JSON.stringify(dispatch.iam_inline_policy, null, 2)}
                />
              )}
              {dispatch.cli.start_automation && (
                <CopyBlock label="aws ssm start-automation-execution" text={dispatch.cli.start_automation} />
              )}
              {ssm.requires_vigil_document && (
                <p className="text-[10px] leading-relaxed text-zinc-600">
                  Custom document: deploy{" "}
                  <a
                    href="https://github.com/awakzdev/Vigil/blob/main/infra/cfn/vigil-remediation-ssm.yaml"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-indigo-700 underline"
                  >
                    vigil-remediation-ssm.yaml
                  </a>{" "}
                  in {ssm.automation_region} when using Vigil-RemediationPlanExecutor.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function IaCRemediationSection({
  findingId,
  checkId,
  embedMode,
  accountId,
}: {
  findingId: string;
  checkId: string;
  bucketName?: string;
  embedMode: "terraform" | "automation";
  accountId?: string | null;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["iac-snippets", findingId],
    queryFn: () => api<IaCResponse>(`/v1/findings/${findingId}/iac-snippets`),
  });

  if (isLoading) {
    return <p className="text-[13px] text-zinc-500">Loading remediation templates…</p>;
  }
  if (error || !data) {
    return <p className="text-[13px] text-zinc-600">Could not load IaC snippets.</p>;
  }

  if (embedMode === "terraform") {
    if (
      data.iac_status === "automation_only" ||
      !data.apply_paths?.terraform_generic ||
      !data.terraform
    ) {
      return (
        <p className="text-[13px] leading-relaxed text-zinc-600">
          {data.reason ?? "No IaC template for this check yet — use Console or CLI instead."}
        </p>
      );
    }

    const providers = data.pr_automation?.providers ?? [];
    const showPrPaused =
      (data.pr_automation?.github_connected || data.pr_automation?.gitlab_connected) &&
      !data.apply_paths?.terraform_pr;
    const showPrReady = data.apply_paths?.terraform_pr && data.pr_automation?.github_connected;

    return (
      <div className="space-y-4">
        {showPrPaused && (
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] leading-relaxed text-zinc-600">
            <span className="font-semibold text-zinc-800">
              {versionControlPrLabel(providers)}
            </span>{" "}
            automation is paused for this check — copy Terraform below or use Remediation → Automation.
          </p>
        )}
        {showPrReady && data.pr_automation?.repos?.[0] && (
          <p className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-[11px] text-indigo-950">
            Repo-aware PRs use <span className="font-semibold">hclpatch</span> +{" "}
            <span className="font-semibold">terraform validate</span> — call{" "}
            <code className="text-[10px]">POST /v1/findings/…/iac/terraform-pr</code> with a connected repo.
          </p>
        )}

        <div>
          <p className="text-[12px] font-semibold text-zinc-800">Terraform</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Runnable module for this finding — <code className="text-[10px]">terraform init</code> then{" "}
            <code className="text-[10px]">terraform apply</code> (AWS CLI + credentials required).
          </p>
          <CopyBlock label="remediation.tf" text={data.terraform} />
        </div>

        {data.hints?.map((h) => (
          <p key={h} className="text-[11px] text-zinc-500">
            {h}
          </p>
        ))}
      </div>
    );
  }

  if (!data.apply_paths?.customer_automation) {
    return (
      <p className="text-[13px] leading-relaxed text-zinc-600">
        SSM remediation is not available for this check yet. Use Console or CLI above.
      </p>
    );
  }

  if (!data.ssm_remediation) {
    return (
      <p className="text-[13px] leading-relaxed text-zinc-600">
        Could not load SSM remediation metadata for this finding.
      </p>
    );
  }

  return (
    <SsmRemediationPanel
      findingId={findingId}
      checkId={checkId}
      accountId={accountId ?? null}
      ssm={data.ssm_remediation}
    />
  );
}

function ExecutionStatus({ findingId }: { findingId: string }) {
  const { data, refetch } = useQuery({
    queryKey: ["remediation-execution", findingId],
    queryFn: () =>
      api<{
        status: string;
        plan_id?: string;
        completed_at?: string;
        error?: string;
        result?: { ok?: boolean };
      }>(`/v1/findings/${findingId}/remediation-execution`),
    refetchInterval: 15_000,
  });
  if (!data || data.status === "none") return null;
  const ok = data.status === "success" || data.result?.ok;
  const inProgress = data.status === "pending" || data.status === "running";
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-[12px] ${
        ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-zinc-200 bg-zinc-50 text-zinc-700"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p>
          Execution <span className="font-semibold">{data.status}</span>
          {data.plan_id && (
            <>
              {" "}
              · plan <span className="font-mono text-[11px]">{data.plan_id.slice(0, 8)}…</span>
            </>
          )}
          {data.error && <> — {data.error}</>}
        </p>
        {inProgress && (
          <button
            type="button"
            onClick={() => void refetch()}
            className="shrink-0 text-[11px] font-medium text-indigo-700 underline"
          >
            Refresh status
          </button>
        )}
      </div>
    </div>
  );
}
