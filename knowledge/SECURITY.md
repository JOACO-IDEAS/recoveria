# Security

Full historical detail: `RECOVERIA-SECURITY-BOUNDARIES.md`, `RECOVERIA-CLIENT-ZERO-SECURITY.md`, `RECOVERIA-CLIENT-ZERO-ROLLBACK.md`, `RECOVERIA-CLIENT-ZERO-INGESTION-RUNBOOK.md`, `RECOVERIA-DATA-RETENTION.md`, `RECOVERIA-REAL-DATA-MODE.md`. This file distills the current/durable rules; those files carry full procedure detail.

## Environments

| Environment | Status | Data |
|---|---|---|
| `LOCAL` | active | Synthetic fixtures only |
| `STAGING_SYNTHETIC` | **proven online, Phase 7C closed** | Frozen 40-document synthetic corpus only |
| `CLIENT_ZERO_READ_ONLY` | **provisioned; narrow canary completed** | Separate read-only database/environment. A previously authorized 20-document canary was persisted for private review; source documents and derived private artifacts remain outside Git. No broader corpus, Drive/OAuth, Product Surface, or outbound action is authorized. |
| `PRODUCTION` | does not exist | — |

**Isolation for `CLIENT_ZERO_READ_ONLY` is implemented at the database and environment-config level** (separate Postgres database with a dedicated least-privilege role, first-class `RECOVERIA_ENVIRONMENT` value with bidirectional fail-closed cross-checks against staging). The narrow canary used an authorized local/manual ingestion path. Dedicated compute, a dedicated Cloud Tasks queue, and any real OAuth/Drive connection remain deferred and separately gated.

## No Client Zero data in any of these, ever

- The synthetic staging database (`recoveria_pilot` / `STAGING_SYNTHETIC`).
- The synthetic Drive root.
- Logs of any kind (application, Cloud Run, Cloud Build, Cloud Tasks).
- Fixtures or test files.
- Screenshots committed to git.
- Automated tests.
- Public demos.

This is a hard boundary enforced today by `node scripts/client-zero-preflight.mjs`, which must return `{"ok":true}` before any commit, and must be run again before this boundary is ever exercised for real.

## Local Client Zero boundary (existing, code already in `src/modules/client-zero`)

- Designated local boundary: `.private/client-zero/` (subfolders `inbox`, `quarantine`, `temp`, `work`, plus historical `analysis`, `invoices`, `checkpoints` from past evaluation work). Fully `.gitignore`d (`/.private/client-zero/**`), never tracked, confirmed via `git ls-files` returning nothing for this path.
- Real-data mode requires **three** separate environment values together (`RECOVERIA_DATA_MODE=client-zero`, `RECOVERIA_CLIENT_ZERO_ACK=I_UNDERSTAND_REAL_DATA_IS_SENSITIVE`, `RECOVERIA_CLIENT_ZERO_PATH=<repo>/.private/client-zero/inbox`); the resolved path must stay below the designated boundary; missing ack or an external path fails closed. Default is always `SYNTHETIC`; file presence alone never activates real-data behavior.
- Logs permit only internal document ID, stage, reason code, status, and safe error class — never raw error messages or document/customer fields. Reports are aggregate-only; screenshots are always zero in this mode.
- If real data is encountered unexpectedly/without authorization: stop, do not inspect/move/copy/log/screenshot/parse it, report only the boundary event without filenames or content.

**These controls enable only mode *selection*. They are not themselves an authorization to process real data** — a separate, explicit founder authorization is always required on top, per `AGENTS.md`'s safety boundaries.

## No secrets anywhere in the repo

No secrets, tokens, database URLs, OAuth client secrets, or credentials in the repository, tracked handoff documents, `knowledge/*.md`, or logs. The optional local handoff follows the same no-secret rule even though it is ignored. Secret values are fetched at runtime from Secret Manager / KMS and are never printed, even for debugging. If you need to confirm a secret exists, check only its presence—never its value.

## Current trust chain (architectural level only — see ARCHITECTURE.md for the full diagram)

Vercel OIDC → Workload Identity Federation (`recoveria-vercel-staging/vercel-staging`) → `recoveria-staging-bff` service account → audience-bound Cloud Run ID token → Product API, invoker-restricted to that one BFF identity. Cloud Tasks delivers to the worker via its own OIDC identity (`recoveria-staging-tasks`), minted only because that identity was explicitly granted `roles/iam.serviceAccountTokenCreator` for the Cloud Tasks service agent — a narrow, service-account-scoped grant, not a project-wide one. Every IAM change in this chain has gone through explicit founder authorization, one minimal grant at a time; this pattern is what any future `CLIENT_ZERO_READ_ONLY` provisioning should repeat, not shortcut.

## Tenant isolation (application-level control, see INVARIANTS.md for the product rule)

Every tenant-owned table carries `organizationId`; repositories require it; compound indexes/uniques include it; background jobs carry and re-verify tenant scope at execution; object keys and signed URLs are tenant-scoped and short-lived and are never themselves treated as authorization proof. PostgreSQL row-level security is recommended as defense-in-depth once real access patterns exist, but application-level checks remain mandatory regardless.

## Data retention (current policy, pre-real-data)

- Originals: retained locally in the private boundary until the data owner authorizes deletion; never auto-deleted.
- Temporary parser artifacts: minimum necessary, restrictive file mode, always deleted in a `finally`.
- Structured extracted candidates: retained only inside an explicitly rollback-scoped local experiment; uncertain values remain evidence, never promoted to truth.
- No cloud backup of Client Zero material exists today. Retention duration and lawful basis require explicit data-owner approval before any real ingestion — this is exactly one of the gates in [CLIENT_ZERO_READINESS.md](CLIENT_ZERO_READINESS.md).

## Real-data gate checklist (from `RECOVERIA-SECURITY-BOUNDARIES.md`, still the bar for Phase 8)

Before any real-data execution: named data-owner authorization; dataset minimization; a threat model; tenant isolation tests; access roles; a secrets manager; encrypted storage/backups; malware scanning; retention/deletion policy; subprocessor and model data-use review; incident response plan; a tested restore; audit-log review; a masked-staging policy; a signed go/no-go record. Until every control on this list has an owner and evidence, stay on synthetic data.
