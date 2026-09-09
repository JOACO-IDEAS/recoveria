# RecoverIA Architecture

## Decision summary

Start as a modular monolith: Next.js App Router and TypeScript for web/server surfaces, PostgreSQL as the authoritative store, Prisma for persistence, object storage behind an interface for original documents, and an asynchronous job boundary for later ingestion. This is the smallest architecture that preserves clean domain and security boundaries while avoiding premature services.

## Logical layers

1. **Web/UI** — server-rendered operational views and narrowly scoped interactive components.
2. **Application services** — commands and queries such as create import, confirm match, calculate ledger view, and request recommendation. This layer enforces authorization and workflow rules.
3. **Domain** — receivables, evidence, resolution, cases, review tasks, and explicit prioritization policies. It does not import UI, parser, or AI SDKs.
4. **Adapters** — Prisma repositories, object storage, document parsers, job runner, authentication, and future model provider.

The repository begins with `src/app`, `src/lib/domain`, `src/test`, and `prisma`. New capabilities should be vertical modules under `src/modules/<capability>` only when Phase 1 starts.

## Runtime topology (future, not provisioned)

- Next.js process: authenticated UI, tenant-scoped commands/queries, import initiation, and status.
- PostgreSQL: structured truth, workflow state, evidence metadata, and audit events.
- Private object storage: immutable originals and derived artifacts; database rows store keys and hashes, not public URLs.
- Worker/job runner: virus scan, fingerprint, classify, parse, extract, normalize, match, and aggregate. Jobs are idempotent and retryable.
- Optional model gateway: schema-constrained extraction or structured-data questions after deterministic methods; no direct database or outbound-channel authority.

No Vercel project, database, storage bucket, queue, model provider, or production environment exists in Phase 0.

## Tenant boundary

`Organization` means the RecoverIA customer/workspace. Every tenant-owned aggregate has `organizationId`; global uniqueness is avoided where business identifiers can repeat across tenants. A request derives organization access from an authenticated membership—not from an untrusted client ID alone. Repositories require tenant scope, compound constraints include it, object keys start with a non-guessable tenant namespace, and background jobs carry and verify the scope.

PostgreSQL row-level security is recommended as defense in depth once operational access patterns are established; application authorization remains mandatory. Cross-tenant administration should use a separate audited support path, never a hidden query bypass.

## Transaction and history boundaries

- Current business state and its corresponding audit event are committed in one database transaction.
- `CollectionEvent`, extraction observations, resolution evidence, and communication events are append-only. Corrections create superseding records or projections.
- Money uses fixed decimal/minor-unit semantics plus ISO 4217 currency; never floating point.
- Dates retain semantic roles (invoice date, due date, payment effective date) and source timezone where applicable.
- Import and parsing commands use idempotency keys and content hashes.

## Authentication and authorization

Authentication provider selection is deferred. Required contract: verified identity, short-lived secure session, membership/role lookup server-side, revocation, and audit context. Initial roles should remain small: `OWNER`, `OPERATOR`, `REVIEWER`, `VIEWER`. Legal review and outbound approval permissions are added only with those workflows.

## Agent boundary

The future Agent is a conversational operating layer over approved, tenant-scoped query tools. It receives structured results with provenance, not unrestricted SQL. Answers cite data cut-off time, filters, totals, and missing evidence. Mutating tools remain separate and require explicit human confirmation; outbound and legal actions are not exposed during the MVP. Recommendation output is a list of applicable signals and a plain-language explanation, not an opaque model score.

## Key architecture decisions still gated

- Authentication vendor and tenancy UX.
- Object storage and job runner provider.
- PostgreSQL hosting and row-level security policy.
- Parser libraries after representative synthetic fixtures are evaluated.
- Model provider, data-retention agreement, and regional constraints.
