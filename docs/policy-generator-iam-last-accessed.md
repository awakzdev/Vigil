# Policy generator vs IAM last-accessed — issue map

**Search terms:** `generated-policy`, `iam_usage`, `actions_json`, `Service access explorer`, `dynamodb` missing, `service:*` wildcard, `policy_warnings`, `service_only_signal`, `ActionLastAccessed`, `TrackedActionsLastAccessed`

**Status:** Fixed in repo (session after v4 map). Use this doc when deepsearch or a future agent sees “service shows as used but not in generated policy” — do **not** re-introduce `service:*` plaster.

---

## Symptom (what users report)

- **Service access explorer** lists a service as used (e.g. `dynamodb`, 17 days ago).
- **Generate least-privilege policy** output has no actions for that service (e.g. no `dynamodb:*`, no `dynamodb:PutItem`).
- Another service in the same role **does** appear (e.g. `route53:ListHostedZones`) — looks inconsistent.

DynamoDB is **not** nested under RDS or EC2 in IAM; it is its own service namespace (`dynamodb`).

---

## Two different IAM signals (data model)

Stored per role in `iam_perm_usage` (one row per `principal_arn` + `service`):

| Field | Source (AWS) | Meaning |
|-------|----------------|---------|
| `last_authenticated` | `ServicesLastAccessed[].LastAuthenticated` | Service was touched in the tracking window |
| `actions_json` | `TrackedActionsLastAccessed` and/or `ActionLastAccessed` | Per-action last use with timestamps |

| Signal | Explorer “used” | Policy generator can narrow to specific APIs |
|--------|-----------------|---------------------------------------------|
| Service-level only (`last_authenticated` set, `actions_json` empty/null) | Yes | **No** — do not invent actions |
| Action-level (`actions_json` with entries in window) | Yes | Yes |

AWS docs: with `Granularity=ACTION_LEVEL`, `TrackedActionsLastAccessed` may still be **null** if the principal did not use tracked actions in the period or IAM has no action breakdown for that service.

---

## Root cause (historical bug)

1. Explorer treated **service-level** `last_authenticated` as “actively used”.
2. Policy generator narrowed `Action: *` using **only** `used_actions_from_usages()` (action-level).
3. When **any** service had action data, `has_action_data=True` → wildcard narrowed to tracked actions only → **service-only services dropped entirely**.

Route53 worked because IAM returned tracked actions. DynamoDB often did not.

**Wrong fix (rejected):** add `dynamodb:*` (or any `service:*`) when service is used but actions are missing — over-grants and hides missing telemetry.

---

## Correct behavior (current design)

### 1. Collector — get real action data when AWS provides it

**File:** `api/app/collectors/last_accessed.py`

- Job: `GenerateServiceLastAccessedDetails` with `Granularity="ACTION_LEVEL"`.
- Parse **both**:
  - `TrackedActionsLastAccessed` → `ActionName` + `LastAccessedTime`
  - `ActionLastAccessed` (legacy) → `ActionName` + `LastAuthenticated`
- On upsert: update `last_authenticated` always; update `actions_json` **only when** the collector parsed action rows (do not overwrite existing `actions_json` with `NULL` on a sparse API response).

**After code changes:** customer should **re-scan** so `iam_perm_usage` is repopulated.

### 2. Policy generator — no invented wildcards

**Files:** `api/app/core/iam_usage.py`, `api/app/routes/accounts.py`

Flow for `GET /v1/accounts/{id}/roles/generated-policy`:

```
usages → tracked_actions = used_actions_from_usages(usages, cutoff)
      → granted = all Allow actions from role inline + attached policy statements
      → used_actions, policy_warnings = augment_used_actions_with_granted_for_service_only(
            tracked_actions, usages, cutoff, granted)
      → _clean_policy_doc(..., used_actions) per inline policy
```

| Case | Behavior |
|------|----------|
| Service has action-level use in window | Include those actions in narrowed policy |
| Service has **only** service-level use | Include **already-granted** concrete actions for that service prefix from role policies (e.g. `dynamodb:PutItem`) |
| Service-only use + grant is only `*` or `dynamodb:*` | **Do not** add `dynamodb:*`; append human-readable `policy_warnings` |
| Service unused (outside window) | Strip grants for that service (existing unused-service logic) |

Helper: `augment_used_actions_with_granted_for_service_only()` — **not** `used_actions_for_policy()` with `service:*` (removed).

Granted actions extracted via `_granted_allow_actions_for_role()` from inline policy docs + attached policy `statements`.

### 3. UI — honest labeling

**Files:** `api/app/routes/accounts.py` (`blast-radius`), `web/src/lib/blastRadiusDisplay.ts`, `ServiceAccessExplorer.tsx`, `BlastRadiusPanel.tsx`

Per service in blast radius / explorer:

| API field | UI |
|-----------|-----|
| `action_tracked: true` | Normal “recently used” row |
| `service_only_signal: true` | Badge **“Service only”** — IAM did not return per-action detail |

Generated policy panel shows `policy_warnings[]` when wildcard-only grants block precise narrowing.

---

## API response fields (generated policy)

```json
{
  "used_actions": ["ec2:DescribeInstances", "dynamodb:PutItem"],
  "used_services": ["dynamodb", "ec2", "route53"],
  "used_services_action_tracked": ["ec2", "route53"],
  "used_services_service_only": ["dynamodb"],
  "policy_warnings": [
    "dynamodb: IAM reported service-level use only (no tracked actions). Granted permissions are wildcard — re-scan or use Access Analyzer for action-level output."
  ],
  "granularity": "action"
}
```

---

## Code map (quick navigation)

| Concern | Path |
|---------|------|
| Action vs service helpers | `api/app/core/iam_usage.py` |
| Generate + blast-radius | `api/app/routes/accounts.py` (`generate_role_policy`, `blast_radius`) |
| Policy doc cleaning | `api/app/routes/accounts.py` (`_clean_policy_doc`, `_granted_allow_actions_for_role`) |
| Collect IAM last accessed | `api/app/collectors/last_accessed.py` |
| DB table | `iam_perm_usage` — `api/app/models/iam.py` |
| Check using same action data | `api/app/checks/iam_perm_granted_vs_used.py` |
| UI generate policy | `web/src/components/FindingDrawer.tsx` (`GeneratedPolicy`, `PolicyCoverageMeta`) |
| Service explorer | `web/src/components/ServiceAccessExplorer.tsx` |
| Tests | `api/tests/test_iam_usage.py`, `test_policy_clean.py`, `test_last_accessed.py` |

---

## Anti-patterns (do not ship again)

| Anti-pattern | Why |
|--------------|-----|
| `dynamodb:*` / `service:*` fallback when actions missing | Over-permissive; masks collector/API gaps |
| Mark service “used” in policy path without checking `actions_json` | Explorer/policy mismatch |
| Overwrite `actions_json` with `NULL` on every upsert | Loses last good action-level snapshot |
| Ignore `ActionLastAccessed` in collector | AWS still returns this shape for some services |

---

## Proper fixes when issue recurs

1. **Verify data:** Query `iam_perm_usage` for role ARN — does `dynamodb` row have `actions_json` populated after re-scan?
2. **Verify collector:** CloudWatch/logs for `perm_usage` job; confirm `ACTION_LEVEL` jobs complete (not stuck `IN_PROGRESS`).
3. **Verify grants:** If role only has `Action: *`, expect `policy_warnings` — correct; point user to Access Analyzer (`README` CFN includes analyzer actions) or split inline policies with explicit service actions.
4. **If AWS never returns actions for a service:** Keep **service-only** badge + warnings; optional future work: CloudTrail-based action inference (separate feature, not `service:*`).

---

## Related checks (same data)

- `iam.perm.granted_vs_used` — skips roles with no `actions_json` at all.
- `iam.role.unused_services_90d` — service-level unused set (different question than policy narrow).

---

## Deepsearch / v4 cross-link

This issue is **not** a v4 roadmap item; it is **IAM least-privilege product correctness**. Linked from [deepsearch-v4-map.md](./deepsearch-v4-map.md) under “Policy generator (IAM last-accessed)”.

Future enhancement (optional, not plaster): wire IAM Access Analyzer policy generation for resource/action ARNs when `advanced=true` and analyzer active — see `_policy_generation_meta()` in `accounts.py`.
