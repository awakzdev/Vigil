"""Pre-written audit response narratives per control.

Copy-paste starting points for SOC2/CIS/ISO questionnaires.
Each narrative describes what the control covers and what evidence Vigil collects.
"""

NARRATIVES: dict[str, str] = {
    # ── SOC2 CC6 ────────────────────────────────────────────────────────────
    "CC6.1": (
        "Logical access to production systems is restricted and continuously monitored. "
        "Vigil collects evidence of IAM user activity, role usage, and access key last-used dates from AWS IAM. "
        "Dormant identities (no activity in 90+ days) are flagged as findings. "
        "GitHub and GitLab member activity is monitored where integrated. "
        "Evidence is collected at each scan and retained for the selected audit period."
    ),
    "CC6.2": (
        "System credentials are issued only to registered, authorized users. "
        "Vigil verifies that no root access keys exist, that each IAM user holds at most one active access key, "
        "and that MFA is enforced at the organization level in GitHub and GitLab where integrated. "
        "Outside collaborators with direct repository access are enumerated and flagged for review."
    ),
    "CC6.3": (
        "Access to protected resources is restricted based on least-privilege principles. "
        "Vigil collects evidence of IAM roles and policies, flagging wildcard Action grants (Action: *), "
        "overly permissive resource scopes, and roles granted write permissions to services they have never called. "
        "Evidence includes inline policy documents, attached managed policy names, and service last-accessed data."
    ),
    "CC6.6": (
        "Logical access controls prevent unauthorized access from outside the organization. "
        "Vigil monitors IAM permission usage (granted vs. actually used) using AWS access advisor data, "
        "flags roles and users with excessive unused permissions, and checks that EC2 security groups "
        "do not expose sensitive ports (SSH/RDP) to 0.0.0.0/0. "
        "GitHub and GitLab branch protection enforcement is included where integrated."
    ),
    "CC6.7": (
        "Transmission and storage of data is protected using encryption controls. "
        "Vigil verifies S3 bucket default encryption (SSE-S3 or SSE-KMS), KMS key rotation status, "
        "HTTPS-only bucket policies, EBS volume encryption, RDS instance storage encryption, "
        "and account-level S3 public access block settings."
    ),
    "CC6.8": (
        "Controls protect against unauthorized or malicious software. "
        "Vigil verifies GuardDuty detector status across regions and Security Hub enablement. "
        "IMDSv2 enforcement on EC2 instances is checked to mitigate SSRF-based metadata exfiltration. "
        "VPC flow log enablement is verified for network traffic visibility."
    ),
    "CC7.1": (
        "Infrastructure changes are subject to change management controls. "
        "Vigil collects GitHub and GitLab branch protection evidence including required reviewers, "
        "dismiss-stale-reviews enforcement, CODEOWNERS file presence, and deployment environment protection. "
        "Self-merge checks flag PRs merged by their own author. "
        "CloudTrail infrastructure events are correlated with GitHub PR merges by timestamp (±60 minutes) "
        "to provide a linked change record for the audit period."
    ),
    "CC7.2": (
        "Security events and anomalies are detected and monitored. "
        "Vigil verifies that AWS CloudTrail is enabled, covers all regions, and has log file validation active. "
        "AWS Config, GuardDuty, and Security Hub enablement are checked. "
        "CloudTrail write events (IAM changes, security group modifications, S3 policy changes) "
        "are collected and retained to support audit sampling."
    ),
    "CC8.1": (
        "Changes to infrastructure are authorized, documented, and tracked. "
        "Vigil collects CloudTrail management events for infrastructure-changing operations "
        "(security group rule changes, IAM user/role creation, S3 policy updates, KMS key operations). "
        "These events are correlated with GitHub and GitLab pull requests merged within ±60 minutes, "
        "linking each infrastructure change to an approved code review where applicable. "
        "Branch protection and required-reviewer evidence from GitHub/GitLab is included in this control."
    ),

    # ── CIS AWS L1 ──────────────────────────────────────────────────────────
    "CIS 1.4": (
        "Vigil verifies that the AWS root account does not have active access keys. "
        "Evidence is collected from the IAM credential report at each scan."
    ),
    "CIS 1.5": (
        "Vigil verifies that MFA is enabled on the AWS root account. "
        "Evidence is collected from the IAM account summary at each scan."
    ),
    "CIS 1.10": (
        "Vigil enumerates all IAM users with console access and verifies MFA device enrollment. "
        "Users with no MFA device are reported as findings. Evidence is collected from IAM at each scan."
    ),
    "CIS 1.14": (
        "Vigil verifies that IAM users do not have access keys older than 90 days without rotation. "
        "Key creation date and last-used date are collected from IAM at each scan."
    ),
    "CIS 1.16": (
        "Vigil verifies that IAM policies are not attached directly to users. "
        "Policy attachments are collected via iam:GetAccountAuthorizationDetails at each scan."
    ),
    "CIS 1.20": (
        "Vigil verifies that a support role exists in the account for incident management. "
        "IAM roles with AWSSupportAccess policy attachment are checked."
    ),
    "CIS 2.1": (
        "Vigil verifies that AWS CloudTrail is enabled and covers all regions. "
        "Trail configuration is collected via cloudtrail:DescribeTrails at each scan."
    ),
    "CIS 2.2": (
        "Vigil verifies that CloudTrail log file validation is enabled on all trails. "
        "This ensures log integrity for audit sampling across the evidence period."
    ),
    "CIS 2.4": (
        "Vigil verifies that CloudTrail trails are integrated with CloudWatch Logs. "
        "Trail configuration is collected at each scan."
    ),
    "CIS 2.6": (
        "Vigil verifies that S3 bucket access logging is enabled on the CloudTrail delivery bucket. "
        "S3 bucket logging configuration is collected at each scan."
    ),
    "CIS 3.1": (
        "Vigil collects CloudTrail events for root account activity. "
        "Any use of root credentials triggers a finding flagged to CC6 and this control."
    ),

    # ── ISO 27001 ────────────────────────────────────────────────────────────
    "A.9.2.1": (
        "Vigil provides evidence of user registration and de-registration through IAM user inventory, "
        "dormancy checks, and access key lifecycle tracking. "
        "GitHub and GitLab member rosters are collected where integrated."
    ),
    "A.9.2.2": (
        "Vigil verifies that access provisioning follows least-privilege by checking role permission usage "
        "against actual service calls (via AWS access advisor) and flagging excessive grants."
    ),
    "A.9.2.3": (
        "Vigil collects evidence of privileged account controls: root MFA, no root access keys, "
        "wildcard IAM action grants, and admin-scope roles not assumed in 90+ days."
    ),
    "A.9.2.4": (
        "Vigil verifies that secret authentication information (access keys) is rotated within 90 days "
        "and that MFA is enforced for console users."
    ),
    "A.9.2.5": (
        "Vigil supports periodic access reviews by collecting IAM user/role/key inventory with "
        "last-activity timestamps and generating CSV exports of the access state at each scan."
    ),
    "A.9.2.6": (
        "Vigil flags access keys and role assumptions inactive for 90+ days, supporting "
        "timely revocation of access rights for leavers and role cleanup."
    ),
    "A.9.4.2": (
        "Vigil verifies MFA enrollment for all console-access IAM users and GitHub/GitLab organization members."
    ),
    "A.10.1.1": (
        "Vigil verifies encryption key management: KMS key rotation status, "
        "key state (enabled/disabled/pending deletion), and CloudTrail trail KMS encryption."
    ),
    "A.10.1.2": (
        "Vigil verifies that key management policies are in place: KMS key rotation enabled, "
        "CloudTrail delivery encrypted, S3 buckets using SSE-KMS where required."
    ),
    "A.12.4.1": (
        "Vigil verifies that event logging is active: CloudTrail enabled with all-regions coverage, "
        "log file validation enabled, VPC flow logs enabled, S3 server access logging enabled."
    ),
    "A.12.6.1": (
        "Vigil verifies that technical vulnerability controls are operating: "
        "GuardDuty enabled across regions, Security Hub enabled, IMDSv2 required on EC2 instances, "
        "EBS volumes encrypted, security groups not exposing sensitive ports."
    ),
    "A.13.1.1": (
        "Vigil collects evidence of network security controls: "
        "security groups are checked for unrestricted SSH/RDP/all-traffic ingress, "
        "default VPC security groups are verified not to allow traffic, "
        "and VPC flow logs are verified to be enabled."
    ),
    "A.13.1.3": (
        "Vigil verifies network segregation controls through VPC flow log collection, "
        "security group rule inventory, and RDS public accessibility checks."
    ),
}
