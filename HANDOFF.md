# Vigil — Handoff

_Last updated: 2026-05-25_

---

## What works today

### Auth
- Email + password signup/login (JWT, bcrypt + sha256 prehash — passlib removed due to bcrypt 4.x bug)
- GitHub OAuth — login + connect/disconnect from Account settings
- Google OAuth — login
- Account settings page: change password / set password (SSO-aware — no current password field for SSO-only users), GitHub connect/disconnect
- SSO users with no password get "Set a password" flow; credential users get "Change password"

### AWS account onboarding
- Create account → CFN launch URL (pre-filled ExternalId + trust principal)
- Verify role via `sts:AssumeRole`
- Trigger scan → Celery task

### Collectors
- `collectors/iam.py` — IAM users, console password, MFA, access keys + last-used, roles + inline policies
- `collectors/last_accessed.py` — service last-accessed per role via AWS async job API (`generate_service_last_accessed_details`)

### Checks
| Check ID | Severity |
|---|---|
| `iam.user.inactive_90d` | medium |
| `iam.access_key.unused_90d` | high |
| `iam.user.no_mfa` | high |
| `iam.role.unassumed_90d` | medium |
| `iam.role.wildcard_action` | high |
| `iam.role.unused_services_90d` | medium |

### Findings UI
- Grouped by check type, sorted by severity
- Severity-tinted group headers, indented finding rows, first-seen date
- Summary stat cards (total / critical+high / medium / max score)
- Filter tabs: open / snoozed / resolved / all
- Snooze / resolve / ignore actions
- Finding detail drawer with evidence, remediation (Console + AWS CLI tabs), combined context block
- `unused_services_90d` drawer: unused service pills, removable inline policy statements, **"Generate" button** — calls `GET /v1/accounts/:id/roles/generated-policy` and shows cleaned vs original policy JSON side-by-side
- CLI commands auto-interpolate actual role/user/key names from the finding ARN
- Scan status polling (5s) + auto-refresh findings on completion; Re-scan unlocks after 5 min if stuck

### Frontend
- Login page: email/password + GitHub SSO + Google SSO
- AWS Accounts page
- Findings page (grouped, severity-aware)
- Account settings page (password + GitHub)
- Sidebar: Vigil logo, AWS Accounts, Findings, Account, Sign out

### Infra
- `compose.yml` — api, worker, db (postgres 16), redis, web, caddy (prod profile)
- Hot reload: uvicorn --reload (api), watchfiles (worker), Vite HMR (web)
- Migrations: 0001_init → 0002_iam_roles_inline_policies → 0003_user_mfa_github → 0004_iam_perm_usage

---

## Architecture reminder

```
Vigil worker (Account A / Hetzner)
  → sts.amazonaws.com  →  AssumeRole (customer's CFN role)
  → iam.amazonaws.com  →  read-only scan

Customer's VPC/firewall is irrelevant — IAM and STS are
AWS control-plane APIs, reachable via public HTTPS.
```

---

## P0 — blockers to first paying customer (in order)

- [ ] **Throwaway AWS sandbox** with seeded junk (inactive users, old keys, no-MFA users, wildcard policy, unassumed roles)
- [ ] **Encrypt `role_arn` + `external_id` at rest** (pgcrypto)
- [ ] **End-to-end test**: signup → CFN → verify → scan → findings populated
- [ ] **Tighten CFN IAM** — drop `SecurityAudit` + `ViewOnlyAccess`, enumerate exact actions
- [x] **Scan progress UI** — poll `GET /v1/accounts/:id/scan-runs`, surface errors
- [ ] **Pagination on `/v1/findings`** (cursor + limit)
- [ ] **CSV export** (`GET /v1/exports/findings.csv`)
- [ ] **pytest skeleton** — botocore Stubber for collectors, unit tests for checks
- [ ] **Hetzner deploy** — domain, Caddy auto-TLS, nightly pg_dump → B2

---

## P1 — after P0

- [ ] Weekly digest email (Resend) — Monday 9am per-org TZ
- [ ] Stripe billing — Checkout + portal + webhook → `orgs.plan`
- [x] Finding detail drawer — evidence, Console/CLI remediation, auto-interpolated resource names
- [ ] **Generate Least-Privilege Policy** — `GET /v1/accounts/:id/roles/generated-policy` strips unused service statements from inline policies and returns cleaned JSON; Access Analyzer CloudTrail-based generation is future work (requires `accessRole` setup)
- [ ] PDF monthly report
- [ ] Slack webhook
- [ ] TOTP MFA (pyotp already in requirements)
- [ ] Refresh tokens (currently 24h JWT, no refresh)
- [ ] Account deletion + role re-verify button

---

## P1 — security hardening

- [ ] Encrypt `aws_accounts.role_arn` + `external_id` at rest
- [ ] CSP + secure cookie flags + HSTS on Caddy
- [ ] Password complexity + breach-check (have-i-been-pwned k-anonymity)
- [ ] Public `/security` page documenting permissions + retention

---

## P2 — next checks

- [ ] `iam.root.usage` — CloudTrail root events
- [ ] `iam.policy.unattached` — managed policies attached to nothing
- [ ] `iam.policy.wildcard_resource` — `Resource: "*"` on dangerous actions
- [ ] `iam.role.trust_wildcard` — `"Principal": "*"` in trust policy
- [ ] `iam.perm.granted_vs_used` — action-level (requires `Granularity=ACTION_LEVEL`, roles only)

## Phase 2

Multi-account via AWS Orgs StackSet · S3/cert/secret/Trail/Config checks · Terraform remediation diffs (GitHub App) · Kubernetes RBAC

---

## Known gaps / shortcuts

| Gap | Notes |
|---|---|
| CORS `*` in dev | locked to `API_PUBLIC_URL` in prod via `APP_ENV` |
| `role_arn` + `external_id` plaintext in DB | P0 #2 |
| No tests | P0 #8 |
| CFN URL pinned to repo `main` | pin to release tag before beta |
| Findings table missing index on `(org_id, status, risk_score)` | fine until ~50k rows |
| No request-id / structured access logging | add before prod |
| One account per org enforced in route | schema is multi-account ready |
| `last_accessed` collector is synchronous polling | ~1-3s per role; fine for MVP, throttle risk at 100+ roles |

---

## Repo

https://github.com/awakzdev/Vigil
