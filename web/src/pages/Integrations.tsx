import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useAccountScanRun } from "../hooks/useAccountScanRun";
import { useIntegrationSyncState } from "../hooks/useIntegrationSyncState";
import {
  AwsMark,
  CategorySection,
  formatSync,
  GitHubMark,
  GitLabMark,
  IconClock,
  IconShield,
  IconSync,
  IconWebhook,
  IntegrationEcosystemCard,
  SlackMark,
  Spinner,
} from "../components/IntegrationsUi";

type ProviderSummary = {
  id: string;
  status: string;
  last_synced_at: string | null;
  repos: number;
  pull_requests: number;
};

type AccountRow = {
  id: string;
  status: string;
  account_id: string | null;
  label: string;
  last_scan_at: string | null;
};

type SettingsSlice = {
  notifications: {
    slack_webhook_url: string | null;
    email_digest_enabled: boolean;
  };
};

function syncHealth(lastAt: string | null): { label: string; tone: "ok" | "warn" | "idle" } {
  if (!lastAt) return { label: "Pending", tone: "idle" };
  const age = Date.now() - new Date(lastAt).getTime();
  if (age > 7 * 24 * 60 * 60 * 1000) return { label: "Stale", tone: "warn" };
  return { label: "Synced", tone: "ok" };
}

function GoogleMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function OktaMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" fill="white" />
    </svg>
  );
}

function BitbucketMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M.778 1.213a.768.768 0 0 0-.768.892l3.263 19.81c.084.5.515.868 1.022.873h14.957a.768.768 0 0 0 .768-.893L18.72 2.105a.768.768 0 0 0-.768-.892H.778zm14.376 15.395h-2.442l-1.676-9.407h2.442l1.676 9.407zM6.28 5.001h2.443l.432 2.422H6.712L6.28 5.001zm1.676 11.607H5.514l-.432-2.422h2.442l.432 2.422z" />
    </svg>
  );
}

function PagerDutyMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H8l5-9v4h3l-5 9z" />
    </svg>
  );
}

function TeamsMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M20.625 8.25H17.5v-1a2.25 2.25 0 0 0-2.25-2.25h-6.5A2.25 2.25 0 0 0 6.5 7.25v1H3.375A1.125 1.125 0 0 0 2.25 9.375v9.75A1.125 1.125 0 0 0 3.375 20.25h17.25a1.125 1.125 0 0 0 1.125-1.125v-9.75A1.125 1.125 0 0 0 20.625 8.25zM8.25 7.25a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 .75.75v1H8.25v-1z" />
    </svg>
  );
}

export default function Integrations() {
  const qc = useQueryClient();
  const prevScanStatus = useRef<string | null>(null);

  const github = useQuery({
    queryKey: ["github-provider"],
    queryFn: () => api<ProviderSummary | null>("/v1/integrations/github"),
  });

  const gitlab = useQuery({
    queryKey: ["gitlab-provider"],
    queryFn: () => api<ProviderSummary | null>("/v1/integrations/gitlab"),
  });

  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<AccountRow[]>("/v1/accounts"),
  });

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<SettingsSlice>("/v1/settings"),
  });

  const awsAccount = accounts.data?.find((a) => a.status === "connected") ?? accounts.data?.[0];
  const connectedAccountId = awsAccount?.id;
  const { isRunning: awsScanRunning, scanStatus } = useAccountScanRun(connectedAccountId);
  const githubSync = useIntegrationSyncState("github");
  const gitlabSync = useIntegrationSyncState("gitlab");

  useEffect(() => {
    if (prevScanStatus.current === "running" && scanStatus === "ok") {
      qc.invalidateQueries({ queryKey: ["github-provider"] });
      qc.invalidateQueries({ queryKey: ["gitlab-provider"] });
      qc.invalidateQueries({ queryKey: ["controls"] });
      qc.invalidateQueries({ queryKey: ["findings"] });
    }
    prevScanStatus.current = scanStatus;
  }, [scanStatus, qc]);

  const showActivityBanner = githubSync.isSyncing || gitlabSync.isSyncing || awsScanRunning;
  const connectedCount =
    (awsAccount?.status === "connected" ? 1 : 0) +
    (github.data ? 1 : 0) +
    (gitlab.data ? 1 : 0) +
    (settings.data?.notifications.slack_webhook_url ? 1 : 0);

  const ghHealth = syncHealth(github.data?.last_synced_at ?? null);
  const glHealth = syncHealth(gitlab.data?.last_synced_at ?? null);
  const slackConnected = !!settings.data?.notifications.slack_webhook_url?.trim();

  return (
    <div className="w-full space-y-10 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950">Integrations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-500">
            Connect cloud, source control, identity, and alerting systems into one compliance evidence pipeline.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {[
            { label: "Active", value: connectedCount, icon: <IconShield className="h-4 w-4 text-emerald-600" /> },
            { label: "Evidence sources", value: (github.data ? 1 : 0) + (gitlab.data ? 1 : 0) + (awsAccount?.status === "connected" ? 1 : 0), icon: <IconSync className="h-4 w-4 text-sky-600" /> },
            { label: "Platform modules", value: 12, icon: <IconWebhook className="h-4 w-4 text-indigo-600" /> },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm shadow-zinc-950/[0.03]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-50 ring-1 ring-zinc-200/80">
                {stat.icon}
              </span>
              <div>
                <div className="text-lg font-bold tabular-nums text-zinc-950">{stat.value}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showActivityBanner && (
        <div className="overflow-hidden rounded-xl border border-indigo-100 bg-indigo-50/80">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5 text-sm text-indigo-800">
            <Spinner className="h-4 w-4 shrink-0 text-indigo-500" />
            <span className="font-semibold">
              {[githubSync.isSyncing && "GitHub sync", gitlabSync.isSyncing && "GitLab sync", awsScanRunning && "AWS scan"]
                .filter(Boolean)
                .join(" · ")}{" "}
              in progress
            </span>
            <span className="text-indigo-600/75">— findings and compliance refresh when complete</span>
          </div>
          <div className="h-0.5 bg-indigo-100">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-indigo-400" />
          </div>
        </div>
      )}

      <CategorySection title="Cloud providers" description="Infrastructure evidence and continuous compliance scanning.">
        <IntegrationEcosystemCard
          name="Amazon Web Services"
          category="Cloud"
          description="IAM, S3, KMS, CloudTrail, and 60+ benchmark checks via read-only role."
          icon={<AwsMark className="h-6 w-6" />}
          iconBg="bg-[#232F3E]"
          href="/accounts"
          connected={awsAccount?.status === "connected"}
          syncing={awsScanRunning}
          loading={accounts.isLoading}
          capabilities={["IAM posture", "Storage encryption", "Audit logging", "Daily scans"]}
          evidence={
            awsAccount?.status === "connected"
              ? [
                  { label: "Account", value: awsAccount.account_id?.slice(-4) ?? "—" },
                  { label: "Checks", value: "71+" },
                  { label: "Scans", value: awsAccount.last_scan_at ? "Active" : "Pending" },
                ]
              : undefined
          }
          opStatus={
            awsAccount
              ? [
                  {
                    icon: <IconSync className="h-3.5 w-3.5" />,
                    label: "Scan health",
                    value: awsScanRunning ? "Running" : awsAccount.last_scan_at ? "Healthy" : "Awaiting scan",
                    tone: awsScanRunning ? "sync" : awsAccount.last_scan_at ? "ok" : "idle",
                  },
                  {
                    icon: <IconClock className="h-3.5 w-3.5" />,
                    label: "Last collection",
                    value: formatSync(awsAccount.last_scan_at),
                    tone: awsAccount.last_scan_at ? "ok" : "idle",
                  },
                  {
                    icon: <IconShield className="h-3.5 w-3.5" />,
                    label: "Permissions",
                    value: awsAccount.status === "connected" ? "Read-only role" : "Not verified",
                    tone: awsAccount.status === "connected" ? "ok" : "warn",
                  },
                ]
              : undefined
          }
          primaryCta={{ label: awsAccount?.status === "connected" ? "Manage AWS" : "Connect AWS", href: "/accounts" }}
        />
        <IntegrationEcosystemCard
          name="Google Cloud"
          category="Cloud"
          description="GCP asset inventory and CIS benchmark mapping."
          icon={<span className="text-lg font-bold">G</span>}
          iconBg="bg-zinc-400"
          comingSoon
          capabilities={["IAM", "GCS encryption", "Audit logs"]}
        />
        <IntegrationEcosystemCard
          name="Microsoft Azure"
          category="Cloud"
          description="Azure AD, storage, and policy compliance evidence."
          icon={<span className="text-sm font-bold">Az</span>}
          iconBg="bg-zinc-400"
          comingSoon
          capabilities={["Entra ID", "Storage", "Defender"]}
        />
      </CategorySection>

      <CategorySection title="Source control" description="Change management and repository security evidence.">
        <IntegrationEcosystemCard
          name="GitHub"
          category="Source control"
          description="Org identity, branch protection, PR approvals, and self-merge detection."
          icon={<GitHubMark className="h-6 w-6" />}
          iconBg="bg-zinc-950"
          href="/integrations/github"
          connected={!!github.data}
          syncing={githubSync.isSyncing}
          loading={github.isLoading}
          capabilities={["Identity sync", "Branch protection", "PR reviews", "Self-merge checks"]}
          evidence={
            github.data
              ? [
                  { label: "Repos", value: github.data.repos },
                  { label: "PRs", value: github.data.pull_requests },
                  { label: "Status", value: ghHealth.label },
                ]
              : undefined
          }
          opStatus={
            github.data
              ? [
                  { icon: <IconSync className="h-3.5 w-3.5" />, label: "Sync health", value: ghHealth.label, tone: ghHealth.tone },
                  { icon: <IconClock className="h-3.5 w-3.5" />, label: "Last collection", value: formatSync(github.data.last_synced_at), tone: github.data.last_synced_at ? "ok" : "idle" },
                  { icon: <IconShield className="h-3.5 w-3.5" />, label: "Permissions", value: "OAuth healthy", tone: "ok" },
                ]
              : undefined
          }
        />
        <IntegrationEcosystemCard
          name="GitLab"
          category="Source control"
          description="Group identity, protected branches, MR approvals, and self-merge detection."
          icon={<GitLabMark className="h-6 w-6" />}
          iconBg="bg-[#e24329]"
          href="/integrations/gitlab"
          connected={!!gitlab.data}
          syncing={gitlabSync.isSyncing}
          loading={gitlab.isLoading}
          capabilities={["Group identity", "Protected branches", "MR reviews", "Self-merge checks"]}
          evidence={
            gitlab.data
              ? [
                  { label: "Repos", value: gitlab.data.repos },
                  { label: "MRs", value: gitlab.data.pull_requests },
                  { label: "Status", value: glHealth.label },
                ]
              : undefined
          }
          opStatus={
            gitlab.data
              ? [
                  { icon: <IconSync className="h-3.5 w-3.5" />, label: "Sync health", value: glHealth.label, tone: glHealth.tone },
                  { icon: <IconClock className="h-3.5 w-3.5" />, label: "Last collection", value: formatSync(gitlab.data.last_synced_at), tone: gitlab.data.last_synced_at ? "ok" : "idle" },
                  { icon: <IconShield className="h-3.5 w-3.5" />, label: "Permissions", value: "OAuth healthy", tone: "ok" },
                ]
              : undefined
          }
        />
        <IntegrationEcosystemCard
          name="Bitbucket"
          category="Source control"
          description="Atlassian repo controls and access review evidence."
          icon={<BitbucketMark className="h-5 w-5" />}
          iconBg="bg-[#0052CC]"
          comingSoon
          capabilities={["Branch rules", "Access reviews", "PR evidence"]}
        />
      </CategorySection>

      <CategorySection title="Identity providers" description="Workforce identity and access governance evidence.">
        <IntegrationEcosystemCard
          name="Google Workspace"
          category="Identity"
          description="User lifecycle, MFA enforcement, and admin privilege reviews."
          icon={<GoogleMark className="h-5 w-5" />}
          iconBg="bg-white text-zinc-800 ring-1 ring-zinc-200"
          comingSoon
          capabilities={["MFA status", "Dormant users", "Admin roles"]}
        />
        <IntegrationEcosystemCard
          name="Okta"
          category="Identity"
          description="SSO assignments, group membership, and MFA posture."
          icon={<OktaMark className="h-5 w-5 text-[#007DC1]" />}
          iconBg="bg-[#007DC1]/10 text-[#007DC1]"
          comingSoon
          capabilities={["SSO apps", "Group sync", "MFA enforcement"]}
        />
        <IntegrationEcosystemCard
          name="Microsoft Entra ID"
          category="Identity"
          description="Azure AD users, conditional access, and privileged roles."
          icon={<span className="text-xs font-bold">Entra</span>}
          iconBg="bg-zinc-400"
          comingSoon
          capabilities={["Conditional access", "PIM", "Guest access"]}
        />
      </CategorySection>

      <CategorySection title="Messaging & alerts" description="Operational notifications and scheduled reporting delivery.">
        <IntegrationEcosystemCard
          name="Slack"
          category="Alerts"
          description="Incoming webhook for weekly digest and operational alerts."
          icon={<SlackMark className="h-5 w-5" />}
          iconBg="bg-[#4A154B]"
          href="/settings"
          connected={slackConnected}
          loading={settings.isLoading}
          capabilities={["Weekly digest", "Scan alerts", "Webhook delivery"]}
          opStatus={[
            {
              icon: <IconWebhook className="h-3.5 w-3.5" />,
              label: "Webhook",
              value: slackConnected ? "Active" : "Not configured",
              tone: slackConnected ? "ok" : "idle",
            },
            {
              icon: <IconSync className="h-3.5 w-3.5" />,
              label: "Digest",
              value: settings.data?.notifications.email_digest_enabled ? "Enabled" : "Off",
              tone: settings.data?.notifications.email_digest_enabled ? "ok" : "idle",
            },
          ]}
          primaryCta={{ label: slackConnected ? "Manage Slack" : "Configure Slack", href: "/settings" }}
        />
        <IntegrationEcosystemCard
          name="PagerDuty"
          category="Alerts"
          description="Incident routing for critical scan failures and compliance regressions."
          icon={<PagerDutyMark className="h-5 w-5" />}
          iconBg="bg-[#06AC38]"
          comingSoon
          capabilities={["Incident routing", "On-call", "Escalation"]}
        />
        <IntegrationEcosystemCard
          name="Microsoft Teams"
          category="Alerts"
          description="Channel notifications for digest and compliance summaries."
          icon={<TeamsMark className="h-5 w-5" />}
          iconBg="bg-[#464EB8]"
          comingSoon
          capabilities={["Channel posts", "Digest", "Alert cards"]}
        />
      </CategorySection>
    </div>
  );
}
