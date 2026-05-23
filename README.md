# Cloud Hygiene

AWS IAM hygiene for small teams. Read-only. Connect an account → daily scan → ranked findings + weekly digest.

MVP scope: one AWS account per org, three IAM checks (inactive users, unused access keys, console users without MFA).

## Architecture (MVP)

```
[browser] → [caddy] → ┬→ [api FastAPI :8000]
                      └→ [web React :5173]
                              ↓
                    [postgres]   [redis] ← [worker Celery + beat]
                                                ↓
                                       sts:AssumeRole → customer AWS
```

Single VPS. Docker Compose. No microservices, no k8s.

## Quickstart (dev)

```bash
cp .env.example .env
# Set TRUST_PRINCIPAL_ARN to your AWS control-plane account root or scanner role ARN.

docker compose up -d db redis
docker compose run --rm api alembic upgrade head
docker compose up api worker web
```

Open http://localhost:5173 → sign up → connect AWS account.

## Onboarding flow

1. Sign up (email + password).
2. `Accounts` page → name account (e.g. `prod`) → `Create`.
3. Click **Launch CloudFormation stack** — pre-fills `ExternalId` + control-plane principal.
4. In AWS console: create stack → copy `RoleArn` output.
5. Paste ARN → **Verify** (server runs `sts:AssumeRole`).
6. **Run scan now** → ~1–3 min → findings populate.

## IAM permissions requested

CFN template at [infra/cfn/hygiene-readonly-role.yaml](infra/cfn/hygiene-readonly-role.yaml).

Managed: `SecurityAudit`, `ViewOnlyAccess`.
Custom: `iam:Generate/GetServiceLastAccessedDetails`, `iam:Get/GenerateCredentialReport`, `iam:GetAccountAuthorizationDetails`, `access-analyzer:List*/Get*`.

**No write permissions. Ever.**

## Checks (MVP)

| Check ID | Severity | Description |
|---|---|---|
| `iam.user.inactive_90d` | medium | Console user not logged in 90+ days |
| `iam.access_key.unused_90d` | high | Active access key unused 90+ days |
| `iam.user.no_mfa` | high | Console user with no MFA device |

Risk score = severity base + age + admin multiplier. Documented in `app/checks/base.py`.

## Project layout

```
api/         FastAPI + SQLAlchemy + Celery + boto3
  app/
    core/        config, db, security, aws (sts)
    models/      SQLAlchemy tables
    routes/      auth, accounts, findings
    collectors/  boto3 → DB upserts
    checks/      pure functions → FindingDraft
    worker/      celery_app + tasks
  migrations/  Alembic
web/         React + Vite + Tailwind + TanStack Query
infra/cfn/   CloudFormation template
caddy/       Caddyfile (prod profile)
```

## Pricing (target)

Per-account, monthly subscription. Free trial. One account in MVP.

## Roadmap (not yet)

Wildcard policies, certs/secrets, S3 hygiene, multi-account via AWS Orgs, k8s RBAC, Terraform remediation diffs, Slack/Jira push.
