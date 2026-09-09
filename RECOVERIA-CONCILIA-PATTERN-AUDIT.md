# RecoverIA–ConcilIA Pattern Audit

## Scope and status

Read-only audit performed against the primary codebase at `/Users/joaquinchristophersen/ConcilliaIA/app`. A lightweight `/Users/joaquinchristophersen/Documents/ConcilIA` documentation folder and `/Users/joaquinchristophersen/ConcilliaIA/concilia-vercel-showroom` were located but were not treated as the architectural source. No ConcilIA file was changed, copied, moved, or linked. Existing ConcilIA working-tree changes, if any, were left untouched.

## Reuse pattern

- **Next.js App Router + strict TypeScript:** separate route surfaces, components, and server/domain libraries. RecoverIA starts with the same broad conventions while staying much smaller.
- **Prisma + PostgreSQL:** explicit relations, compound uniqueness, indexes, mappings, generated client outside domain code, and migrations as reviewed artifacts.
- **Server-side membership authorization:** ConcilIA’s `requireOrganizationAccess` checks persisted membership rather than trusting a client-supplied organization ID. RecoverIA makes this a repository/application-service invariant.
- **Contact/channel separation:** people and their context-specific channels/relationships are distinct rather than flattened into invoice fields.
- **Parser adapter boundary:** ConcilIA’s CSV/PDF/Excel extractors share a small interface and prevent parser libraries leaking through the application. RecoverIA extends the idea to classification, source locations, scanned/native PDF routing, and structured field observations.
- **Append-oriented evidence and observations:** ConcilIA contains evidence facts, extraction runs, correlation/assessment logs, identity signals, and agent observations. RecoverIA adopts immutable source/evidence/decision history.
- **Human-review workflow concepts:** reviewable matches and shadow-match status demonstrate that uncertainty should become explicit work.
- **Offline test gate:** ConcilIA separates deterministic offline tests from database/fixture suites. RecoverIA begins with fast offline policy tests and will introduce integration suites deliberately.
- **Operational inbox and structured agent modules:** domain-specific work queues and operational summaries are preferable to a generic chatbot.
- **Configuration discipline:** environment example, generated output isolation, strict lint/type/build scripts, and provider adapters are sound project hygiene.

## Adapt

- ConcilIA’s `Organization` represents a managed building/client in parts of its schema. In RecoverIA, `Organization` is exclusively the SaaS tenant; administrations, debtors, and buildings are separate domain entities.
- ConcilIA currently notes global tax-ID uniqueness in a single-tenant context. RecoverIA requires tenant-scoped identifiers and compound uniqueness from its first migration.
- The parser interface currently returns plain text. RecoverIA needs source-addressed blocks and typed field evidence, because confidence and page/sheet/cell provenance are product requirements.
- Soft deletion is useful for mutable directory records, but evidence, ledger, case history, and audit logs need append-only/supersession semantics—not generic `deletedAt`.
- Magic-link/pilot access offers useful security lessons but authentication provider/code should be selected independently for RecoverIA.
- Agent conversations/observations suggest useful boundaries, but RecoverIA tools must be read-only over structured receivables first and carry evidence/as-of metadata.
- ConcilIA’s Vercel patterns can inform later deployment, but environment/provider setup is deferred until an authorized gate.

## Do not reuse

- Business concepts for consorcio administration, units, obligations, bank reconciliation, payment notices, providers, compliance, WhatsApp, or ConcilIA-specific status taxonomies.
- Schema/code copied wholesale, database migrations, seeded/customer data, credentials, generated clients, `.vercel` linkage, deployment IDs, or production infrastructure.
- A global tax identifier constraint, a single-tenant assumption, or organization naming that conflates tenant and debtor/building.
- Parser results that discard coordinates/raw values, silent entity merging, invoice payment status inferred without ledger evidence, or fixed jurisdictional legal deadlines.
- Any channel implementation that could send autonomously, and any AI architecture with unrestricted SQL/outbound/legal authority.

## Audit conclusion

The preferred stack remains justified. Reuse ConcilIA’s boundary patterns and engineering lessons, not its business schema or infrastructure. A modular monolith is appropriate until ingestion workload or security isolation produces measured pressure for a separate worker/service.
