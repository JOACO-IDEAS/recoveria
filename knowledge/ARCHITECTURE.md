# Architecture

Full historical detail: `RECOVERIA-ARCHITECTURE.md` (original decision record), `docs/RECOVERIA-PHASE-7B-RUNTIME-ROLES.md`, `docs/RECOVERIA-PHASE-7C-1-RUNTIME-DEPLOYMENT.md`, `docs/RECOVERIA-PHASE-6B-1-CONNECTED-SOURCES-ARCHITECTURE.md`, `docs/RECOVERIA-PHASE-4-7C-EVIDENCE-INSPECTOR.md`, `docs/RECOVERIA-PHASE-4-6B-REAL-DOCUMENT-UNDERSTANDING.md`. This file is the current, distilled map.

## Shape

Modular monolith: Next.js App Router + TypeScript for web/server surfaces, PostgreSQL (Prisma) as the authoritative store, object storage behind an interface for originals, an asynchronous job boundary (Cloud Tasks) for ingestion/sync work. One repository, vertical modules under `src/modules/<capability>`, no premature service split.

```
src/modules/
  client-zero            -- read-only mode gate, preflights, canary persistence, private review/verification logic
  collection-interactions
  collections-engine
  communication-execution
  communication-preparation
  connected-sources      -- Drive provider wiring, OAuth, checkpoint, sync orchestration
  contact-relationships
  controlled-email-smoke
  delivery-reconciliation
  email-provider
  entity-resolution
  ingestion
  operational-intelligence
  product-surface        -- read model for Facturas/Evidence Inspector
  staging                -- STAGING_SYNTHETIC-only worker/probe wiring (Phase 7C)
```

Logical layers (unchanged since Phase 0): Web/UI → Application services (commands/queries, enforces authorization/workflow) → Domain (receivables, evidence, resolution, cases, prioritization policy — imports nothing UI/parser/AI-specific) → Adapters (Prisma repositories, object storage, parsers, job runner, auth, model provider).

## Proven runtime topology (Phase 7C, deployed to `STAGING_SYNTHETIC`)

```
founder browser → Vercel (apps/web, BFF) → WIF → Product API (Cloud Run) → Postgres
                                                        ↓
                                                  Cloud Tasks (OIDC)
                                                        ↓
                                              Worker (Cloud Run, private)
```

- **`apps/web`** — separate Next.js app on Vercel. Hand-rolled BFF (`apps/web/lib/staging-bff.ts`) proxies an explicit allowlist of paths to the Product API through a Workload Identity Federation exchange (`apps/web/lib/wif.ts`): Vercel OIDC → `recoveria-vercel-staging/vercel-staging` → `recoveria-staging-bff` SA → audience-bound Cloud Run ID token. Header forwarding is an explicit named allowlist (`FORWARDED_IDENTIFIER_HEADERS`), never a generic `X-*` passthrough.
- **Product API** — the same root Next.js codebase, run via `next start` on Cloud Run (`recoveria-staging-api`), invoker restricted to `recoveria-staging-bff`.
- **Worker** — a separate private Cloud Run composition (`scripts/staging/run-sync-worker.ts`), invoker restricted to `recoveria-staging-tasks`. Ingress accepts Cloud Tasks OIDC only. Task identity is read from `X-CloudTasks-TaskName` (the bare short task ID — see `src/modules/staging/worker-http.ts`; this was a fixed bug, don't reintroduce the old "full resource path" assumption) and cross-checked against the body-declared name before any work runs.
- **Cloud Tasks** — deterministic task naming (`sync-<hash>` / `probe-<hash>`) gives idempotent dispatch (409-on-duplicate) and an explicit namespace check preventing cross-path confusion.
- **The async no-provider probe** (`StagingAsyncProbe`, `src/modules/staging/async-probe.ts`) is structurally isolated from the real sync path — its worker has no execute/provider callback parameter at all, so Drive invocation is impossible, not merely unconfigured. This is how the full async chain was proven online without touching Drive.

Real deploy artifacts run via `tsx` directly inside the container (see `deploy/Dockerfile.worker` / `deploy/Dockerfile.product-api`) — not through an esbuild bundle. Don't trust an esbuild/webpack build check as proof the real deploy will work; check the Dockerfile.

## Connected Sources / Drive ingestion

A Connected Source is the product-owned projection over an existing durable provider connection + confirmed root + execution ledger + checkpoint — not a second OAuth or ingestion state machine. **Google Drive supplies documentary truth only**: existence, stated identifiers/dates, nominal stated values, candidate entities, provenance, relationships, duplicates. It never establishes outstanding balance, payment status, reconciled debt, collectibility, prescription, or legal status (see [INVARIANTS.md](INVARIANTS.md)).

Reused as-is across phases: durable OAuth state/callback, encrypted credential envelope (KMS), `GoogleDriveSource`/`RealGoogleDriveClient` (root-bounded read-only adapter), `IncrementalCorpusProcessor` + checkpoint, Product Surface read model. `drive.readonly` scope only; Picker is folder-only, My Drive mode; the selected folder ID is revalidated server-side before being trusted.

## Document understanding

Native-PDF decoding via `pdfjs-dist` (local, no network/OCR/DB mutation) emits provider-neutral text observations (page, coordinates, extraction method, parser version, categorical confidence) before any field interpretation. Dates carry semantic roles (`ISSUE_DATE`, `PAYMENT_DUE_DATE`, `SERVICE_PERIOD_START/END`, `FISCAL_AUTHORIZATION_EXPIRY`, `ISSUER_REGISTRATION_DATE`, `OTHER_DATE`, `UNKNOWN_DATE`) — fiscal-authorization expiry is never treated as a payment due date, issuer registration metadata is never treated as invoice date. Extraction confidence is `HIGH`/`MEDIUM`/`LOW`/`UNAVAILABLE`; evidence classification is `FACT`/`INFERENCE`/`UNKNOWN` (see [INVARIANTS.md](INVARIANTS.md)). This pipeline has already been privately evaluated once against the real 20-document Client Zero cohort (Phase 4.6B) with 20/20 core-field extraction and zero network/OCR/production mutation — see [CLIENT_ZERO_READINESS.md](CLIENT_ZERO_READINESS.md) for what that evaluation does and doesn't prove for Phase 8.

## Entity resolution

Only two deterministic auto-resolution paths exist: exact single-candidate 11-digit CUIT match with no contradicting candidate, or exactly one active human-confirmed alias with no active rejection/contradiction. Everything else requires human review — exact/similar name, building, email, phone, domain, and contact never auto-resolve alone. A contradiction outranks an otherwise-exact identifier and returns `CONFLICT`. Full detail: `RECOVERIA-ENTITY-IDENTITY-POLICY.md`.

## Evidence Inspector / Product Surface

`EvidenceInspectorProvider` is mounted once around the app shell; any surface renders an `EvidenceReference` and the provider owns the single dialog/focus/dismissal lifecycle against the shared `DocumentViewer`. Interaction model: `claim or state → why → evidence → original source`. The deployed Product Surface still reads the synthetic/checkpoint-backed model and has no authorized Client Zero adapter. Separately, a local-only Client Zero review server can stream private PDFs and render proposals, independent verification, comparison, and founder labels; it is never deployed and its data is absent from Git. The stable Product Surface adapter boundary remains `DocumentExtraction`.

## Prioritization and aging

Deterministic, versioned, explainable — no opaque ML score. Policy `recoveria-operational@1`: explicit precedence order (`REVIEW_LEGAL_THRESHOLD` > `REVIEW_ENTITY` > `ADD_CONTACT` > `REVIEW_DISPUTE` > `VERIFY_PROMISE` > active-promise no-action > stale follow-up > `REVIEW_OLD_RECEIVABLE` > ordinary follow-up > no-action). Aging buckets (`CURRENT`, 1-30, 31-60, 61-90, 91-180, 181-365, 365+) are a versioned policy value, not scattered constants; `legalReviewAfterDays` is separate and only ever creates a review flag, never a legal conclusion.

## Async/communication infrastructure already in the schema

The Prisma schema already contains `CommunicationExecution`/`CommunicationSendAttempt`/`CommunicationSendOutcome`/`CommunicationDeliveryEvent` models (built in earlier phases for a controlled, approved-draft send pipeline). **This infrastructure existing in code does not authorize any real sending.** Draft creation and send approval are separate permissions; real outbound sending to a real debtor/administration remains a hard founder-authorization gate regardless of what's wired in code (see [SECURITY.md](SECURITY.md)).

## ConciliIA boundary

ConcilIA is a separate, related project (`/Users/joaquinchristophersen/ConcilliaIA/app`). A one-time read-only pattern audit was performed (`RECOVERIA-CONCILIA-PATTERN-AUDIT.md`) to extract reusable *engineering patterns* (App Router conventions, Prisma discipline, server-side membership authorization, parser adapter boundaries, append-only evidence). **Nothing was reused from ConcilIA's business schema, data, credentials, or infrastructure**, and nothing should be in the future without a fresh, explicit, scoped audit. Do not access or modify ConcilIA.

## Key architecture decisions still open

Authentication vendor/tenancy UX beyond the current founder-only staging gate; object storage provider for real documents; production PostgreSQL hosting and row-level security policy; model/AI provider selection; Catedral integration shape (see [DATA_SOURCES.md](DATA_SOURCES.md)).
