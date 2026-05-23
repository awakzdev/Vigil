# Cloud Hygiene — session context

This file is auto-loaded by Claude Code on every session. Read it before doing anything.

## What this is

AWS IAM hygiene SaaS for small/mid teams. Read-only. Connect AWS account → daily scan → ranked findings → weekly digest (planned). Killer feature: Monday IAM cleanup digest as a recurring ritual, not just a dashboard.

**Not** a CSPM (Wiz/Prisma). Focus: stale access, over-permissive IAM, forgotten infra, ownership gaps.

## Constraints (do not violate)

- AWS only (no GCP/Azure/k8s in MVP)
- Read-only IAM (`SecurityAudit` + `ViewOnlyAccess` for now; tighten before public beta)
- One AWS account per org in MVP (schema is multi-account ready)
- Solo founder, Docker Compose, no microservices, no k8s
- FastAPI + Postgres + Celery + React + Tailwind + TanStack Query
- Hetzner VPS + Cloudflare + Caddy auto-TLS for prod
- Pricing: per-account monthly subscription + free trial

## Architecture

```
caddy → api (FastAPI :8000)  →  postgres
       → web (React :5173)        ↑
                                  ↓
                       worker (Celery + beat) ─→ sts:AssumeRole → customer AWS
                                  ↑
                                redis
```

## Repo layout

```
api/
  app/
    core/       config, db, security, aws (sts), passwords
    models/     SQLAlchemy 2.0 tables
    routes/     auth, accounts, findings
    collectors/ boto3 → DB upserts (IAM only so far)
    checks/     pure functions → FindingDraft, registry, persist
    worker/     celery_app + tasks (run_scan, scan_all_accounts)
  migrations/   Alembic (0001_init has full schema)
web/            React + Vite + Tailwind + TanStack Query
infra/cfn/      hygiene-readonly-role.yaml (ExternalId + SecurityAudit + extras)
caddy/          Caddyfile (prod profile)
compose.yml
README.md
HANDOFF.md      detailed status + roadmap (read this for scope)
```

## What works today

- Signup / login (JWT, bcrypt + sha256 prehash — passlib removed due to bcrypt 4.x bug)
- GitHub OAuth + Google OAuth (login + connect/disconnect from Account settings)
- Account settings page: change/set password (SSO-aware), GitHub connect/disconnect
- Create AWS account → CFN launch URL (pre-filled ExternalId + control plane principal)
- Verify role via `sts:AssumeRole`
- Trigger scan → Celery task
- Collectors: IAM users + console password + MFA + access keys + last-used + service last-accessed per role
- 6 checks: `iam.user.inactive_90d`, `iam.access_key.unused_90d`, `iam.user.no_mfa`, `iam.role.unassumed_90d`, `iam.role.wildcard_action`, `iam.role.unused_services_90d`
- Risk scoring (severity base + age + admin)
- Diff-aware persist: open new, refresh existing, auto-resolve missing, auto-reopen
- Findings UI: grouped by check, severity-tinted headers, indented rows, stat cards, snooze/resolve/ignore
- Finding detail drawer: evidence (service pills, removable statements), Console/CLI remediation (auto-interpolates role/user/key names), generate least-privilege policy button (`GET /v1/accounts/:id/roles/generated-policy`)
- Scan status polling + auto-refresh; Re-scan unlocks after 5 min if stuck
- Hot reload everywhere: api (uvicorn --reload), worker (watchfiles), web (Vite HMR)
- Service-linked roles (`/aws-service-role/`) excluded from all checks and perm-usage collection

## P0 (revised, in order)

1. Throwaway AWS sandbox account with seeded junk (inactive users, old keys, no-MFA users, wildcard policy)
2. Encrypt `aws_accounts.role_arn` and `external_id` at rest (pgcrypto)
3. End-to-end test: signup → CFN → verify → scan → findings populated
4. Tighten IAM permissions in CFN — drop `SecurityAudit` + `ViewOnlyAccess`, list exact actions collectors need
5. `scan_runs` progress + error surface in UI (poll `GET /v1/accounts/:id/scan-runs`)
6. Pagination on `/v1/findings` (cursor + limit)
7. More checks: root usage, role unassumed 90d, policy unattached, wildcard action, wildcard resource, wildcard trust
8. CSV export
9. pytest skeleton: botocore Stubber for collectors, unit tests for checks
10. Hetzner deploy + domain + Caddy TLS + nightly pg_dump → B2

## P1 (after P0)

- Weekly digest email (Resend)
- Stripe billing (Checkout + portal + webhook)
- Finding detail drawer with Console/CLI/Terraform remediation tabs
- PDF monthly report
- Slack webhook
- TOTP MFA on user accounts
- Refresh tokens

## Phase 2 (not now)

S3/cert/secret/Trail/Config/GuardDuty checks → Terraform remediation diffs (GitHub App) → multi-account AWS Orgs StackSet → Kubernetes RBAC + cert-manager.

## Style + decisions

- Caveman mode: terse replies, fragments OK, drop articles/filler. Code/commits/security written normal.
- Commits: conventional + Co-Authored-By Claude footer
- No emojis in code/docs unless explicitly requested
- Diff-aware findings (don't recreate; reopen)
- Risk score must be hand-verifiable (no ML, no magic)
- "Snooze" first-class — customers will never resolve everything

## Quickstart

```bash
cp .env.example .env
# set TRUST_PRINCIPAL_ARN, JWT_SECRET
docker compose up -d db redis
docker compose run --rm api alembic upgrade head
docker compose up
# http://localhost:5173
```

## Known gaps / shortcuts

- CORS `*` in dev, locked in prod via APP_ENV
- No tests yet
- `role_arn` + `external_id` plaintext in DB (P0 #2 fixes)
- One account per org enforced in route (schema is fine)
- CFN URL pinned to repo `main` — pin to release tag once stable
- No request-id / structured access logging

## Repo

https://github.com/awakzdev/Vigil

Read `HANDOFF.md` for full status + 2-week roadmap. Read `README.md` for onboarding flow.
