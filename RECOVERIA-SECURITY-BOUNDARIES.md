# RecoverIA Security Boundaries

## Phase 0 hard boundaries

- Synthetic fixtures only. No real invoices, customer records, personal email, Google Drive, credentials, or production exports.
- No shared database, object storage, authentication tenant, environment, deployment, or secrets with ConcilIA.
- No Vercel project, Neon database, cloud resource, outbound messaging provider, or model API is configured.
- `.env*` is ignored except the secret-free `.env.example`; local/import/upload directories are ignored.

## Trust zones

1. **User device/file:** untrusted bytes and filenames.
2. **Upload edge/quarantine:** validation and scanning; no parser trust and no public access.
3. **Worker:** least-privilege read of a staged object and tenant-scoped write; parsers run with resource/time limits and no unnecessary network.
4. **Application:** authenticated, authorized commands and queries; no direct browser database/storage credentials.
5. **Data stores:** private PostgreSQL/object storage with encryption, backups, access logs, retention, and tenant-aware keys.
6. **External processors:** opt-in only after vendor review, purpose limitation, regional/retention assessment, and contractual approval.

## Tenant isolation controls

- Server derives active organization from verified membership.
- All tenant-owned database tables include `organizationId`; repositories require it and compound indexes/uniques include it.
- Relational writes verify referenced rows share the same tenant.
- Background jobs contain a tenant ID plus resource ID and re-authorize at execution.
- Object keys and signed URLs are tenant-scoped, short-lived, and never accepted as authorization proof.
- Exports, logs, caches, rate limits, search indexes, metrics, and future vector stores preserve the tenant boundary.
- Negative cross-tenant tests are mandatory. PostgreSQL RLS is defense in depth, not a replacement for application checks.

## Data minimization and lifecycle

Collect only fields required for receivables operations. Classify financial/contact data as confidential, restrict production access, redact structured logs, and never log document content or tokens. Define retention separately for originals, derived artifacts, audit history, backups, and failed/quarantined files before real ingestion. Deletion must respect lawful obligations and produce an auditable tombstone without retaining unnecessary content.

## Auditability

Security- and business-relevant events capture tenant, actor/service, action, target, outcome, timestamp, request/job ID, and safe change metadata. Append-only event tables prohibit updates/deletes through normal application roles. Clock, policy version, parser/model version, and evidence references support reconstruction. Sensitive values and message bodies are excluded or redacted.

## Human-authority enforcement

Capabilities are enforced server-side, not merely hidden in UI. Draft creation and approval are separate permissions; future sending requires an additional explicit action, fresh authorization, idempotency, rate limits, and immutable event. MVP exposes no send adapter. Threats, negotiation, acceptance of payment terms, and legal initiation are never autonomous tool capabilities.

## Legal-review safety

RecoverIA stores configurable review rules with jurisdiction, effective dates, author/approver, and disclaimer. A trigger creates `LegalReviewFlag`/`ReviewTask`; it does not calculate a universal prescription conclusion. Only qualified humans change legal-review disposition.

## Real-data gate checklist

Before Phase 9: named data owner authorization; dataset minimization; threat model; tenant isolation tests; access roles; secrets manager; encrypted storage/backups; malware scanning; retention/deletion; subprocessors and model data-use settings; incident response; restore test; audit-log review; masked staging policy; and signed go/no-go record. Until every required control has an owner and evidence, use synthetic data.
