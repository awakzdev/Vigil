/**
 * Auditor-facing evidence guidance + audit narrative per check (drawer Compliance tab).
 * Kept separate from terse remediationSummaries impact/risk lines.
 */
import { remediationSummaries, type RemediationSummary } from "./remediationSummaries";

export type CheckComplianceCopy = {
  evidenceGuidance: string;
  auditNarrative: string;
};

function copy(
  evidenceGuidance: string,
  auditNarrative: string,
): CheckComplianceCopy {
  return { evidenceGuidance, auditNarrative };
}

function iamAccessKey(checkId: string, _s: RemediationSummary): CheckComplianceCopy {
  switch (checkId) {
    case "iam.access_key.unused_90d":
      return copy(
        "Evidence: IAM credential report or console screenshot for the owning user — access key ID, status (Active/Inactive/Deleted), and Last used date (blank or older than 90 days). Include change ticket with owner sign-off after deactivation or deletion.",
        "Vigil reads each access key's last-used timestamp from IAM. Keys with no API activity in the lookback window are flagged so auditors can confirm dormant programmatic credentials are removed — leaked keys should not remain valid for months without use.",
      );
    case "iam.access_key.no_rotation_90d":
      return copy(
        "Evidence: Key creation date, rotation date (if any), and post-rotation status showing only the new key is active. Retain deployment/CI ticket proving workloads were updated before the old key was retired.",
        "Vigil flags access keys that exceed your rotation-age threshold. SOC 2 and CIS expect periodic rotation of long-lived programmatic credentials so compromise of an old key has a bounded exposure window.",
      );
    case "iam.access_key.multiple_active":
      return copy(
        "Evidence: Screenshot or export listing both active key IDs on the same IAM user, plus documentation of which key each workload uses. After cleanup, only one Active key (or none) should remain.",
        "AWS allows two active keys per user for rotation, but two long-lived active keys often means unclear ownership. Vigil flags multiple Active keys so auditors can verify each key has a named owner and the spare is removed.",
      );
    default:
      return copy(
        "Evidence: IAM access key inventory for the user — key IDs, status, and last-used timestamps.",
        "Vigil evaluates IAM programmatic credential hygiene on each scan using AWS last-used metadata.",
      );
  }
}

function iamUser(checkId: string, _s: RemediationSummary): CheckComplianceCopy {
  switch (checkId) {
    case "iam.user.no_mfa":
      return copy(
        "Evidence: IAM user Security credentials page showing MFA device assigned (virtual or hardware). Screenshot for each console-capable user in scope.",
        "Vigil flags IAM users with console access enabled but no registered MFA device. This check is about second-factor enforcement for interactive sign-in — not access key rotation or user deletion.",
      );
    case "iam.user.inactive_90d":
      return copy(
        "Evidence: User list with last activity date, plus record of disable/delete or access review approval to keep the account. Show password/console login disabled if retained for audit.",
        "Vigil marks IAM users with no sign-in or API activity in the inactivity window. Auditors expect stale human identities to be disabled or removed so compromised dormant accounts cannot be reactivated unnoticed.",
      );
    case "iam.user.direct_policy_attachment":
      return copy(
        "Evidence: IAM group/role model diagram or policy attachment export showing permissions moved off direct user attachments. Before/after list of managed and inline policies on the user.",
        "Direct policy attachments bypass group-based access reviews. Vigil flags users with policies attached outside groups so access changes stay auditable and revocable at scale.",
      );
    default:
      return copy(
        "Evidence: IAM user configuration export relevant to this identity control.",
        "Vigil evaluates IAM user posture during each account scan.",
      );
  }
}

function iamRole(checkId: string, _s: RemediationSummary): CheckComplianceCopy {
  switch (checkId) {
    case "iam.role.unassumed_90d":
      return copy(
        "Evidence: Role last-assumed date from IAM or CloudTrail, plus owner confirmation or deletion record. If retained, document business justification and next review date.",
        "Vigil flags IAM roles not assumed within the lookback period. Unused roles may still carry broad policies — auditors expect orphan roles to be removed or justified.",
      );
    case "iam.role.wildcard_action":
      return copy(
        "Evidence: Inline policy JSON showing Action \"*\" on the role, and revised policy with explicit action list after scoping. Note which workloads assume this role.",
        "Vigil detects inline policies with Action \"*\" (full service action space). This is narrower than a full admin policy but still dangerous if the role is assumed — scope actions to what the workload actually calls.",
      );
    case "iam.role.full_admin_policy":
      return copy(
        "Evidence: Attached customer-managed policy document with Action \"*\" and Resource \"*\", plus replacement least-privilege policy. Change ticket with security approval.",
        "Vigil flags customer-managed policies granting unrestricted actions on all resources. Full-admin attachments are a common path to account-wide compromise if the role is assumed.",
      );
    case "iam.role.unused_services_90d":
      return copy(
        "Evidence: IAM access advisor or service last-accessed export for the role, plus updated policy with unused service statements removed.",
        "Vigil compares granted IAM services against service last-accessed data. Services granted but never used in the window should be removed to shrink blast radius.",
      );
    case "iam.role.trust_wildcard":
      return copy(
        "Evidence: Trust policy JSON before and after — Principal scoped to specific accounts, services, or ARNs instead of \"*\".",
        "Vigil flags trust policies that allow any AWS principal to attempt AssumeRole. Trust should name only intended assumers.",
      );
    case "iam.role.external_account_trust":
      return copy(
        "Evidence: Trust policy showing external account IDs, vendor contract or integration approval, and ExternalId/condition keys where used. Exclude approved scan roles from samples.",
        "Vigil flags cross-account sts:AssumeRole grants to principals outside your account. Each external account ID should map to an approved integration — not a stale vendor or partner.",
      );
    default:
      return copy(
        "Evidence: Role trust and permission policy exports for the affected IAM role.",
        "Vigil evaluates IAM role trust and permission scope on each scan.",
      );
  }
}

function iamPolicy(checkId: string, _s: RemediationSummary): CheckComplianceCopy {
  switch (checkId) {
    case "iam.policy.wildcard_resource":
      return copy(
        "Evidence: Policy JSON (inline or customer-managed) showing write actions with Resource \"*\", plus revised statements scoped to specific ARNs. List roles/users the policy attaches to.",
        "Vigil flags write-capable statements that target all resources of a type (Resource \"*\"). This finding is about over-broad resource scope on policies Vigil can parse — tighten ARNs, then re-scan.",
      );
    case "iam.policy.unattached":
      return copy(
        "Evidence: Policy list showing zero attachments, or deletion record. Optional hygiene — document if retained for template use.",
        "Unattached customer-managed policies are optional hygiene (often disabled in Settings). They are not a SOC 2/CIS fail by themselves but add IAM clutter that may be re-attached with broad grants.",
      );
    default:
      return copy(
        "Evidence: Customer-managed IAM policy document and attachment list.",
        "Vigil lists customer-managed policies and evaluates attachment and statement scope.",
      );
  }
}

function iamRoot(checkId: string, _s: RemediationSummary): CheckComplianceCopy {
  switch (checkId) {
    case "iam.root.no_mfa":
      return copy(
        "Evidence: MFA assigned on the root user (IAM sign-in → Security credentials shows an active MFA device). Screenshot or export for the auditor sample.",
        "This finding is about root MFA only — not wildcard IAM policies or security groups. Vigil validates that the account root has a registered MFA device; re-scan after assignment to clear the control.",
      );
    case "iam.root.has_access_keys":
      return copy(
        "Evidence: Root Security credentials showing no access keys, or deletion confirmation. Document automation audit proving nothing used root keys before deletion.",
        "Root access keys bypass all IAM policies. Vigil flags any active root key — they should not exist; use IAM users or roles for programmatic access.",
      );
    case "iam.root.usage":
      return copy(
        "Evidence: CloudTrail records of root API activity with business justification, plus plan to move tasks to IAM admin roles. Show reduced root usage after change.",
        "Vigil detects recent root API activity. Root should be break-glass only — routine operations belong on IAM identities with scoped policies and MFA.",
      );
    default:
      return copy(
        "Evidence: Root account Security credentials and CloudTrail samples for root activity.",
        "Vigil monitors root credential posture and recent root API usage.",
      );
  }
}

function s3(checkId: string, _s: RemediationSummary): CheckComplianceCopy {
  const bucket =
    checkId === "s3.account.public_access_not_blocked"
      ? "account-level S3 Block Public Access"
      : "bucket Block Public Access settings";
  if (checkId.includes("public_access")) {
    return copy(
      `Evidence: AWS console or CLI output showing all four Block Public Access settings enabled at ${checkId.startsWith("s3.account") ? "account" : "bucket"} scope. Screenshot before/after remediation.`,
      `Vigil verifies S3 public access block configuration. ${checkId.startsWith("s3.account") ? "Account-level" : "Bucket-level"} blocks prevent accidental public ACLs or policies from exposing objects.`,
    );
  }
  if (checkId === "s3.bucket.no_https_policy") {
    return copy(
      "Evidence: Bucket policy JSON with Deny on aws:SecureTransport = false, or AWS Config rule compliance screenshot.",
      "Vigil checks for a deny-insecure-transport statement so clients cannot read objects over unencrypted HTTP.",
    );
  }
  if (checkId === "s3.bucket.no_kms" || checkId === "s3.bucket.no_default_encryption") {
    return copy(
      "Evidence: Default encryption configuration showing SSE-S3 or SSE-KMS enabled on the bucket.",
      "Vigil flags buckets without default encryption at rest. Auditors expect new objects to inherit encryption automatically.",
    );
  }
  if (checkId === "s3.bucket.no_logging") {
    return copy(
      "Evidence: Server access logging target bucket and prefix configuration enabled on the data bucket.",
      "Vigil verifies S3 server access logging for object-level audit trails required in many SOC 2 samples.",
    );
  }
  if (checkId === "s3.bucket.no_mfa_delete") {
    return copy(
      "Evidence: Versioning + MFA Delete enabled (requires root), or documented exception if versioning not used.",
      "Vigil flags versioned buckets without MFA Delete so a compromised IAM user cannot permanently wipe all object versions.",
    );
  }
  return copy(
    `Evidence: S3 ${bucket} configuration export for the affected bucket.`,
    "Vigil evaluates S3 encryption, access, and logging controls during each scan.",
  );
}

function cloudtrail(checkId: string, _s: RemediationSummary): CheckComplianceCopy {
  switch (checkId) {
    case "cloudtrail.trail.not_enabled":
      return copy(
        "Evidence: Multi-region trail configuration with S3 delivery bucket, management events enabled, and recent log delivery proof.",
        "Vigil flags regions without an active CloudTrail trail. API audit logs are baseline evidence for SOC 2 logical access and change investigations.",
      );
    case "cloudtrail.trail.no_log_validation":
      return copy(
        "Evidence: Trail settings showing log file validation enabled, plus sample digest file reference.",
        "Log file validation lets auditors detect tampering with stored CloudTrail objects. Vigil expects validation on production trails.",
      );
    case "cloudtrail.trail.no_kms":
      return copy(
        "Evidence: Trail encryption settings with CMK ARN and key policy allowing CloudTrail delivery.",
        "Vigil flags trails not encrypted with KMS so audit log confidentiality meets encryption control expectations.",
      );
    case "cloudtrail.trail.s3_bucket_public":
      return copy(
        "Evidence: S3 bucket policy and Block Public Access showing no public access on the log bucket — treat as urgent.",
        "A public CloudTrail bucket exposes full API history. Vigil treats this as critical data exposure, not a minor misconfiguration.",
      );
    case "cloudtrail.trail.no_cloudwatch_logs":
      return copy(
        "Evidence: CloudWatch Logs integration on the trail with log group and IAM role for delivery.",
        "Shipping trails to CloudWatch enables faster detection workflows; Vigil flags missing integration where real-time review is expected.",
      );
    case "cloudtrail.trail.s3_bucket_no_logging":
      return copy(
        "Evidence: Server access logging enabled on the CloudTrail S3 bucket with target log bucket named.",
        "Access to the audit bucket itself should be logged. Vigil flags missing S3 access logging on the trail bucket.",
      );
    default:
      return copy(
        "Evidence: CloudTrail trail configuration export and recent log delivery proof.",
        "Vigil evaluates CloudTrail coverage and log integrity settings per region.",
      );
  }
}

function ec2SecurityGroup(checkId: string, _s: RemediationSummary): CheckComplianceCopy {
  switch (checkId) {
    case "ec2.security_group.unrestricted_ssh":
      return copy(
        "Evidence: Security group rule export showing SSH (tcp/22) no longer allows 0.0.0.0/0 or ::/0 — restricted CIDR or SSM-only access documented.",
        "Vigil flags security groups exposing SSH to the entire internet. CIS and SOC 2 network controls expect administrative access to be source-restricted.",
      );
    case "ec2.security_group.unrestricted_rdp":
      return copy(
        "Evidence: Security group rules showing RDP (tcp/3389) not open to 0.0.0.0/0, or alternative access method documented.",
        "Internet-wide RDP is a common ransomware entry point. Vigil flags 0.0.0.0/0 on port 3389 for remediation before audit sampling.",
      );
    case "ec2.security_group.default_allows_traffic":
      return copy(
        "Evidence: Default security group with zero inbound/outbound rules in each VPC, plus launch template or runbook requiring named SGs.",
        "Vigil flags custom rules on the VPC default SG — not live instance exposure. CIS expects the default SG empty so accidental launches do not inherit permissive rules.",
      );
    default:
      return copy(
        "Evidence: Security group rule export for the affected group.",
        "Vigil evaluates EC2 security group ingress against sensitive port baselines.",
      );
  }
}

function github(checkId: string, _s: RemediationSummary): CheckComplianceCopy {
  if (checkId === "github.repo.no_codeowners" || checkId === "gitlab.repo.no_codeowners") {
    return copy(
      "Evidence: CODEOWNERS file in repo or documented policy exception. Optional check — often disabled.",
      "CODEOWNERS is optional hygiene for Git repos (GitHub and GitLab). SOC 2 change management typically relies on branch protection and required reviews, not CODEOWNERS alone.",
    );
  }
  if (checkId.startsWith("github.org.")) {
    return copy(
      "Evidence: GitHub organization security settings export (MFA, membership) after remediation.",
      "Vigil syncs GitHub org settings for identity controls mapped to change-management and access evidence.",
    );
  }
  return copy(
    "Evidence: Repository branch protection / ruleset screenshot showing required reviews and restrictions after change.",
    "Vigil ingests GitHub branch protection and review settings for SOC 2 change-management controls — separate from AWS IAM scans.",
  );
}

function gitlab(checkId: string, _s: RemediationSummary): CheckComplianceCopy {
  if (checkId.startsWith("gitlab.org.")) {
    return copy(
      "Evidence: GitLab group security settings (2FA, membership) after remediation.",
      "Vigil syncs GitLab group settings for identity and access evidence in change-management mappings.",
    );
  }
  return copy(
    "Evidence: Protected branch / merge request approval settings export after remediation.",
    "Vigil evaluates GitLab merge request and branch protection rules for change-management evidence.",
  );
}

function defaultCopy(checkId: string, s: RemediationSummary): CheckComplianceCopy {
  const topic = checkId.split(".")[0] ?? "resource";
  return copy(
    `Evidence: Configuration export or screenshot showing the issue is remediated (${s.impact.replace(/\.$/, "")}). Retain change ticket linking fix to owner.`,
    `Vigil runs this ${topic} check on every scan. ${s.impact} ${s.risk} Re-scan after applying: ${s.fix}`,
  );
}

const BUILDERS: Record<string, (s: RemediationSummary) => CheckComplianceCopy> = {
  "iam.access_key.": iamAccessKey,
  "iam.user.": iamUser,
  "iam.role.": iamRole,
  "iam.policy.": iamPolicy,
  "iam.root.": iamRoot,
  "s3.": s3,
  "cloudtrail.": cloudtrail,
  "ec2.security_group.": ec2SecurityGroup,
  "github.": github,
  "gitlab.": gitlab,
};

const SPECIFIC: Record<string, (s: RemediationSummary) => CheckComplianceCopy> = {
  "iam.perm.granted_vs_used": () =>
    copy(
      "Evidence: IAM access advisor export for the role showing granted vs. last-accessed services, plus policy diff with unused write actions removed.",
      "Vigil compares granted write permissions against service last-accessed data. Unused write scope should be removed before audit sampling — this is the core least-privilege signal in Vigil.",
    ),
  "iam.access_inventory_gap": () =>
    copy(
      "Evidence: Successful full IAM scan completion and user roster export after fixing scan role permissions.",
      "Vigil could not complete the IAM user inventory — access roster evidence may be incomplete until the scan role permissions are fixed and a new scan succeeds.",
    ),
  "iam.account.no_support_role": () =>
    copy(
      "Evidence: IAM role with AWSSupportAccess (or AWS-managed Support role) and trust limited to support engineers.",
      "AWS support cases should not require root. Vigil checks for a dedicated support-access role in the account.",
    ),
  "iam.account.password_policy_weak": () =>
    copy(
      "Evidence: IAM account password policy meeting your minimum length, complexity, reuse, and expiration settings.",
      "Vigil compares the account password policy to baseline thresholds for human IAM user passwords.",
    ),
  "aws.account.contact_incomplete": () =>
    copy(
      "Evidence: Screenshot or export of AWS Account → Contact information showing complete primary contact (address, city, country, phone).",
      "CIS 1.1 requires current account contact details for billing and security notifications. Vigil reads account contact via the scan role.",
    ),
  "aws.account.security_contact_missing": () =>
    copy(
      "Evidence: SECURITY alternate contact with email and phone in Account → Alternate contacts.",
      "CIS 1.2 requires a registered security contact. Vigil flags missing SECURITY alternate contact data.",
    ),
  "iam.server_certificate.expired": () =>
    copy(
      "Evidence: IAM server certificate list showing expired certs removed (or replacement cert in use).",
      "CIS 1.18 — expired IAM server certificates should be deleted. Vigil lists server certs via ListServerCertificates.",
    ),
  "iam.cloudshell_full_access_granted": () =>
    copy(
      "Evidence: IAM policy attachment export showing AWSCloudShellFullAccess detached from non-break-glass principals.",
      "CIS 1.21 — restrict AWSCloudShellFullAccess to roles that truly need CloudShell.",
    ),
  "kms.key.policy_wildcard_principal": () =>
    copy(
      "Evidence: KMS key policy JSON with Principal scoped to specific accounts/roles — no \"*\" principals.",
      "Vigil flags KMS key policies that allow wildcard principals, which can grant decrypt rights beyond intended workloads.",
    ),
  "kms.key.no_rotation": () =>
    copy(
      "Evidence: KMS key rotation status enabled (automatic annual rotation for symmetric keys).",
      "Annual key rotation limits exposure if key material is compromised. Vigil flags symmetric CMKs without rotation enabled.",
    ),
  "guardduty.open_findings": () =>
    copy(
      "Evidence: GuardDuty finding archive/suppression with justification, or remediation proof for underlying resource.",
      "Vigil surfaces active GuardDuty findings so threat issues are not ignored during compliance review — triage or remediate before audit.",
    ),
  "guardduty.detector.not_enabled": () =>
    copy(
      "Evidence: GuardDuty detector ENABLED in each in-scope region.",
      "Vigil flags disabled GuardDuty detectors — continuous threat detection is expected in modern SOC 2 AWS samples.",
    ),
  "aws.config.rules_non_compliant": () =>
    copy(
      "Evidence: AWS Config compliance timeline showing resource returned to COMPLIANT or approved exception record.",
      "Vigil reports Config rules in NON_COMPLIANT state so configuration drift is visible before the auditor asks.",
    ),
  "aws.config.not_enabled": () =>
    copy(
      "Evidence: Config recorder ON with delivery channel to S3, plus sample configuration history item.",
      "AWS Config provides configuration history for audits. Vigil flags accounts without an active recorder.",
    ),
  "aws.access_analyzer.not_enabled": () =>
    copy(
      "Evidence: IAM Access Analyzer created in active regions with finding review process documented.",
      "Access Analyzer detects unintended external access to resources. Vigil flags missing analyzers in scanned regions.",
    ),
  "aws.securityhub.not_enabled": () =>
    copy(
      "Evidence: Security Hub enabled with AWS Foundational Security Best Practices (or org standard) active.",
      "Security Hub aggregates control findings. Vigil flags disabled hubs where centralized compliance visibility is expected.",
    ),
  "vpc.flow_logs.not_enabled": () =>
    copy(
      "Evidence: VPC flow log delivering to CloudWatch Logs or S3 with retention stated.",
      "VPC flow logs support network forensics. Vigil flags VPCs without flow logging enabled.",
    ),
  "ec2.ami.aged": () =>
    copy(
      "Evidence: Launch template or ASG using a newer AMI build date, plus patch cadence documentation.",
      "Vigil flags AMIs older than the patch-age threshold so workloads are not launched from stale images.",
    ),
  "ec2.ami.public": () =>
    copy(
      "Evidence: AMI permissions showing Private — no allAccounts launch permission.",
      "Public AMIs may leak application secrets or IP. Vigil flags AMIs shared with all AWS accounts.",
    ),
  "ec2.instance.imdsv2_not_required": () =>
    copy(
      "Evidence: Instance metadata options requiring IMDSv2 (HttpTokens required) on affected instances.",
      "IMDSv1 enables SSRF-based credential theft from EC2. Vigil flags instances that still allow IMDSv1.",
    ),
  "ec2.ebs.encryption_not_default": () =>
    copy(
      "Evidence: Regional EBS encryption-by-default enabled.",
      "Vigil flags regions where new EBS volumes may be created unencrypted by default.",
    ),
  "ec2.ebs.volume_unencrypted": () =>
    copy(
      "Evidence: Encrypted snapshot/volume replacement plan executed — new encrypted volume attached.",
      "Existing unencrypted volumes violate encryption-at-rest expectations. Vigil flags attached unencrypted volumes.",
    ),
  "ec2.ebs.snapshot_public": () =>
    copy(
      "Evidence: Snapshot permissions with no public createVolumePermission.",
      "Public EBS snapshots can expose full disk contents. Vigil flags snapshots shared publicly.",
    ),
  "ec2.ebs.snapshot_unencrypted": () =>
    copy(
      "Evidence: Encrypted copy of the snapshot with migration plan to encrypted volumes.",
      "Unencrypted snapshots carry the same data exposure as unencrypted volumes. Vigil flags them for remediation.",
    ),
  "rds.instance.publicly_accessible": () =>
    copy(
      "Evidence: RDS Modify showing Publicly accessible = No, plus security group restricting database port.",
      "Vigil flags RDS instances with a public endpoint — databases should sit in private subnets with controlled ingress.",
    ),
  "rds.instance.no_encryption": () =>
    copy(
      "Evidence: Encrypted snapshot restore or new encrypted instance — storage encryption at rest enabled.",
      "RDS storage encryption is required for most SOC 2 data-at-rest samples. Vigil flags unencrypted instances.",
    ),
  "rds.instance.no_automated_backup": () =>
    copy(
      "Evidence: Backup retention period ≥ 7 days (or your policy minimum) on the instance.",
      "Automated backups underpin recovery objectives. Vigil flags instances with backups disabled or zero retention.",
    ),
  "rds.instance.no_deletion_protection": () =>
    copy(
      "Evidence: Deletion protection enabled on production RDS instances.",
      "Deletion protection prevents accidental destroy via a single API call. Vigil flags production instances without it.",
    ),
  "rds.instance.no_multi_az": () =>
    copy(
      "Evidence: Multi-AZ enabled or documented HA architecture exception approved by management.",
      "Single-AZ RDS has no automatic host failover. Vigil flags single-AZ databases where availability is in scope.",
    ),
  "dynamodb.table.no_encryption": () =>
    copy(
      "Evidence: Table encryption at rest enabled (AWS owned or CMK).",
      "Vigil flags DynamoDB tables without explicit encryption at rest configuration.",
    ),
  "dynamodb.table.no_pitr": () =>
    copy(
      "Evidence: Point-in-time recovery enabled on the table.",
      "PITR protects against accidental table deletes. Vigil flags tables without continuous backups.",
    ),
  "acm.certificate.expiring": () =>
    copy(
      "Evidence: Renewed or replaced certificate with expiry beyond the warning window, attached to listeners.",
      "Vigil warns before ACM certificate expiry so TLS services do not break in production during audit periods.",
    ),
  "lambda.function.deprecated_runtime": () =>
    copy(
      "Evidence: Function configuration on a supported runtime after test/deploy.",
      "Unsupported Lambda runtimes stop receiving security patches. Vigil flags deprecated runtimes before AWS blocks invocation.",
    ),
  "lambda.function.no_dlq": () =>
    copy(
      "Evidence: Asynchronous invoke configuration with SQS/SNS dead-letter queue attached.",
      "Failed async invocations without a DLQ leave no recovery path. Vigil flags missing DLQs on async functions.",
    ),
  "secretsmanager.secret.no_rotation": () =>
    copy(
      "Evidence: Rotation enabled with Lambda rotation function and successful rotation history.",
      "Static secrets in Secrets Manager should rotate automatically. Vigil flags secrets without rotation configured.",
    ),
  "ssm.parameter.plaintext_secret": () =>
    copy(
      "Evidence: Parameter recreated as SecureString (or moved to Secrets Manager) with KMS key.",
      "Plaintext SSM String parameters expose values in API responses. Vigil flags likely secrets stored unencrypted.",
    ),
  "elb.load_balancer.no_access_logs": () =>
    copy(
      "Evidence: Access logs enabled with S3 bucket and prefix configured.",
      "Load balancer access logs support request-level forensics for internet-facing services.",
    ),
  "elb.load_balancer.weak_tls_policy": () =>
    copy(
      "Evidence: Listener security policy using TLS 1.2+ and modern cipher suites.",
      "Legacy TLS policies allow weak ciphers. Vigil flags listeners below the configured TLS baseline.",
    ),
  "sns.topic.no_encryption": () =>
    copy(
      "Evidence: SNS topic SSE-KMS configuration with CMK ARN.",
      "Vigil flags SNS topics without KMS encryption at rest for messaging controls.",
    ),
  "sqs.queue.no_encryption": () =>
    copy(
      "Evidence: SQS queue SSE-KMS enabled with CMK.",
      "Vigil flags SQS queues without KMS server-side encryption on message payloads.",
    ),
};

function builderFor(checkId: string): ((s: RemediationSummary) => CheckComplianceCopy) | null {
  if (SPECIFIC[checkId]) return SPECIFIC[checkId];
  for (const [prefix, fn] of Object.entries(BUILDERS)) {
    if (checkId.startsWith(prefix)) {
      return (s) => fn(checkId, s);
    }
  }
  return null;
}

export function complianceCopyForCheck(checkId: string): CheckComplianceCopy | null {
  const s = remediationSummaries[checkId];
  if (!s) return null;
  const build = builderFor(checkId);
  return build ? build(s) : defaultCopy(checkId, s);
}

/** Short scanner description for Overview / documentation (not auditor templates). */
export function scanDescriptionForCheck(checkId: string, s: RemediationSummary): string {
  const specific: Record<string, string> = {
    "iam.access_key.unused_90d":
      "Access keys with no recorded API usage in the last 90 days.",
    "iam.access_key.no_rotation_90d":
      "Access keys older than the configured rotation-age threshold.",
    "iam.access_key.multiple_active": "IAM users with more than one Active access key.",
    "iam.policy.wildcard_resource":
      "Customer-managed or inline policies granting write actions on Resource \"*\".",
    "iam.root.no_mfa": "Root user without an assigned MFA device.",
    "iam.user.no_mfa": "Console-capable IAM users without MFA assigned.",
  };
  return specific[checkId] ?? s.impact.replace(/\.$/, "") + ".";
}
