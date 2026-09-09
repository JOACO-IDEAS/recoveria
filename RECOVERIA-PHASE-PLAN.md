# RecoverIA Phase Plan

Each phase is a separate authorization gate. Completion means acceptance evidence exists; it does not automatically authorize the next phase.

## Phase 0 — Foundation and architecture (this repository state)

Independent repository, product/architecture/security decisions, minimal Next.js/TypeScript/Prisma shell, offline policy tests, no persistence models, integrations, deployment, or real data.

**Exit:** documents reviewed; boundaries accepted; local checks green.

## Phase 1 — Domain model and synthetic fixtures

Implement tenant-first Prisma schema, migrations, repositories, append-only evidence/audit constraints, money/date types, and a synthetic invoice corpus with expected outputs.

**Exit:** schema review, migration tests, tenant-negative tests, invariant tests, and fixture governance approved.

## Phase 2 — Invoice ingestion and parsing

Build batch state machine, private local test storage adapter, CSV/XLSX/native-PDF parsers, scanned-PDF detection, evidence locations, retries, and reviewable failures. OCR may be evaluated behind an adapter, not assumed.

**Exit:** fixture quality/cost/throughput benchmark and idempotency/corrupt-file tests pass.

## Phase 3 — Entity resolution

Implement normalization, aliases, deterministic identifier matching, ranked candidates, decision UI, human corrections, and calibration. No silent merges.

**Exit:** false auto-match threshold and uncertain-review workflow accepted on synthetic truth sets.

## Phase 4 — Receivables ledger and aging

Implement append-only entries, payments/allocations, as-of projections, multi-currency separation, aging policies, portfolio tables, and reconciliation tests.

**Exit:** deterministic totals/buckets reconcile to fixtures and drill-down evidence.

## Phase 5 — Operational inbox and prioritization

Create “Atención de hoy,” explicit policy signals, reason codes, assignments, stale/missing-data queues, and explanation templates. Avoid opaque aggregate AI scores.

**Exit:** every ordering is reproducible and explainable; policy version and missing facts are visible.

## Phase 6 — Conversational operating layer

Add tenant-scoped, read-only structured query tools for portfolio questions; grounded answers cite filters, as-of time, and evidence. No generic database/chat access.

**Exit:** adversarial authorization, hallucination, prompt-injection, and answer-reconciliation evals pass.

## Phase 7 — Collection case workflow

Implement case grouping, immutable events, ownership, disputes, promises, review tasks, and configurable legal-review flags. No outbound communications.

**Exit:** workflow/permission audit and event reconstruction tests pass.

## Phase 8 — Communication drafts and approval

Prepare drafts grounded in case facts with template/model versions, approval separation, and previews. Sending remains disabled unless separately scoped after this phase.

**Exit:** unsupported-claim evaluation, approval audit, and privacy review pass.

## Phase 9 — Controlled Client Zero real-data ingestion

Execute the security checklist, provision isolated non-production resources, authorize a minimal dataset, ingest in a controlled window, monitor access, and reconcile results with Client Zero reviewers.

**Exit:** owner sign-off, security evidence, data-quality report, deletion/retention confirmation, and rollback exercise.

## Phase 10 — Measured collection pilot

Run a narrowly scoped human-operated pilot, establish baseline and outcome metrics, review fairness/error modes, and decide whether outbound sending should ever be proposed as a later, separate gate.

**Exit:** measured value, incident/error review, user feedback, and explicit go/no-go.

## Cross-cutting gates

Every phase must preserve tenant isolation, immutable evidence, human authority, synthetic-data default, observability without sensitive logs, migration rollback/restore planning, and explicit architecture decisions. Provider selection and deployment are justified at the first phase that truly needs them.
