# Remediation (customer-hosted)

Vigil stays **read-only** for scanning. Remediation runs in **your** AWS account.

## Flow

1. Open a finding → **Remediation plan** (`GET /v1/findings/{id}/remediation-plan`).
2. Review steps and generated policies in the UI (Console/CLI/IaC tabs).
3. Approve in UI (future) → EventBridge invokes **your** Lambda with a signed plan payload.
4. Lambda assumes a **narrow write role** and applies only the approved change.
5. CloudTrail + Vigil link the mutation back to `finding_id` / `report_id`.

## Customer infrastructure

Launch `infra/cfn/vigil-remediation-runner.yaml` in the account you want to remediate. It creates:

- `VigilRemediationRole` (write scope you define in the template)
- `VigilRemediationLambda` (stub handler — replace with your approved actions)
- EventBridge rule (optional) for `vigil.remediation.approved` events

Vigil does not assume this role today. Wire EventBridge from your approval workflow or run the Lambda manually with the JSON plan.

## IaC / PRs (next)

Generated Terraform/CloudFormation snippets and GitHub PRs reuse the same plan JSON — copy into your existing repos; Vigil does not require a greenfield repo.
