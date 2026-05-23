# Vigil

**AWS IAM hygiene for small teams.** Read-only. Connect an account → daily scan → ranked findings.

> Not a CSPM. Focused on the things that actually bite teams: stale access, over-permissive roles, forgotten keys, users without MFA.

---

## How it works

```
Your browser
     │
     ▼
  Caddy (reverse proxy)
     ├──▶ API (FastAPI :8000) ──▶ Postgres
     └──▶ Web (React :5173)
                                    ▲
                               Worker (Celery)
                                    │
                              sts:AssumeRole
                                    │
                                    ▼
                            Customer AWS account
                         (read-only, via CFN role)
```

Single VPS · Docker Compose · No k8s · No microservices

---

## Quickstart

```bash
cp .env.example .env
# Required: set TRUST_PRINCIPAL_ARN to your scanner role/account ARN
# Required: set JWT_SECRET to a long random string

docker compose up -d db redis
docker compose run --rm api alembic upgrade head
docker compose up api worker web
```

Open **http://localhost:5173**

---

## Onboarding a customer account

1. Sign up (email + password, or GitHub/Google SSO)
2. **AWS Accounts** → name it → **Create**
3. Click **Launch CloudFormation stack** — ExternalId and trust principal are pre-filled
4. In the AWS Console: deploy the stack → copy the `RoleArn` output
5. Paste the ARN → **Verify** (server calls `sts:AssumeRole` to confirm)
6. **Run scan** → ~1–3 min → findings appear

---

## Checks

| Check ID | Severity | What it finds |
|---|---|---|
| `iam.user.inactive_90d` | medium | Console user with no login or API activity in 90+ days |
| `iam.access_key.unused_90d` | high | Active access key unused for 90+ days |
| `iam.user.no_mfa` | high | Console user with no MFA device |
| `iam.role.unassumed_90d` | medium | Role not assumed in 90+ days |
| `iam.role.wildcard_action` | high | Inline policy grants `Action: "*"` |
| `iam.role.unused_services_90d` | medium | Role has permissions to services it never calls |

Risk score = severity base + age bonus + admin flag. See [`app/checks/base.py`](api/app/checks/base.py).

---

## IAM permissions

Deployed via [`infra/cfn/hygiene-readonly-role.yaml`](infra/cfn/hygiene-readonly-role.yaml).

**Managed policies:** `SecurityAudit`, `ViewOnlyAccess`

**Custom additions:**
- `iam:GenerateServiceLastAccessedDetails` / `iam:GetServiceLastAccessedDetails`
- `iam:GenerateCredentialReport` / `iam:GetCredentialReport`
- `iam:GetAccountAuthorizationDetails`
- `access-analyzer:List*` / `access-analyzer:Get*`

**No write permissions. Ever.**

The role uses an `ExternalId` condition (confused deputy protection). Only your `TRUST_PRINCIPAL_ARN` can assume it.

---

## Architecture notes

- **Cross-account scanning:** Vigil's worker (Account A) assumes a read-only role in the customer's account (Account B) via `sts:AssumeRole`. Nothing runs inside the customer's network — IAM and STS are AWS control-plane APIs reachable over public HTTPS.
- **Diff-aware findings:** findings are not recreated on each scan. Existing open findings are refreshed; findings that disappear are auto-resolved; fixed-then-broken findings are reopened.
- **Snooze-first UX:** customers will never resolve everything. Snooze is first-class.

---

## Project layout

```
api/
  app/
    core/        config, db, security, aws (sts), passwords
    models/      SQLAlchemy 2.0 tables (org, user, aws_account, iam, finding)
    routes/      auth, accounts, findings
    collectors/  boto3 → DB upserts (iam.py, last_accessed.py)
    checks/      pure functions → FindingDraft (base, registry, persist)
    worker/      celery_app + tasks (run_scan, scan_all_accounts)
  migrations/    Alembic (0001_init → 0004_iam_perm_usage)
web/             React + Vite + Tailwind + TanStack Query
infra/cfn/       hygiene-readonly-role.yaml
caddy/           Caddyfile (prod profile only)
compose.yml
```

---

## Auth

- Email + password (bcrypt + sha256 prehash)
- GitHub OAuth (connect in Account settings or sign in directly)
- Google OAuth
- JWT (24h). Refresh tokens: planned.

---

## Pricing (target)

Per-account monthly subscription · Free trial · One AWS account per org in MVP (schema is multi-account ready)

---

## Roadmap

**P0 (current):** sandbox AWS account with seeded junk · encrypt `role_arn` at rest · E2E test · tighten CFN perms · scan progress UI · pagination · CSV export · pytest skeleton · Hetzner deploy

**P1:** Weekly digest email (Resend) · Stripe billing · Finding detail drawer with remediation tabs · PDF report · Slack webhook · TOTP MFA

**Phase 2:** S3/cert/secret checks · multi-account via AWS Orgs StackSet · Terraform remediation diffs · Kubernetes RBAC
