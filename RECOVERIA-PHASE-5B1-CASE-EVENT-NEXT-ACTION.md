# RecoverIA Phase 5B.1 — Case State, Event Ledger & Next Action

## Object model

The 5B.1 slice lives in `src/modules/collections-engine`. A `CollectionCase` remains one durable building-scoped unit of work and references multiple invoices without flattening their individual state. Administración remains a derived rollup and is not a case identity. `CollectionInvoice` is a projection input; balances continue to come from the financial ledger rather than collections events.

## Workflow state versus conditions

Primary workflow state answers only where the operator is working: `REVIEW_REQUIRED`, `WORKABLE`, `WAITING_FOR_RESPONSE`, or `RESOLVED`. Independent, composable conditions explain the business situation: uncertain entity, missing contact, active/broken promise, disputed invoice, payment to verify, and legal-review threshold. A case can therefore expose a disputed invoice while another overdue invoice remains collectible.

Promise and dispute remain related-object state. Disputes are invoice-granular. Payment claims are collections facts awaiting verification and never alter outstanding balance; only the existing financial ledger may do that.

## Append-only event ledger and corrections

`CollectionEvent` records tenant, case, time, actor/source, reason, evidence, and optional invoice/decision relationships. `appendCollectionEvent()` rejects duplicate IDs, cross-tenant/cross-case data, invoices outside the case, and invalid correction references, then deeply freezes the appended fact. History is never edited or deleted.

A correction is another event with `supersedesEventId`. `effectiveCollectionEvents()` excludes the superseded fact from current projection while preserving both records in history. Material collections events require a human actor and a related decision at the write gate.

## Deterministic projection and recommendation

`projectCollectionCase()` derives workflow state, current priority, conditions, collectible and excluded invoice IDs, outstanding balance, evidence, and a reproducible `Recommendation`. The recommendation records action, reasons, blockers, evaluation time, evidence and `collections-next-action/1`; it is frozen, non-authoritative, non-mutating, and never writes events.

The bounded 5B.1 next-action taxonomy is: `REVIEW_CASE`, `VERIFY_PAYMENT`, `CONTACT`, `FOLLOW_UP`, `WAIT`, `REQUEST_INFORMATION`, `REVIEW_DISPUTE`, `RECORD_PROMISE`, `PREPARE_LEGAL_REVIEW`, and `CLOSE_CASE`. Ordered rules are explicit—there is no AI, score, ML, or network call. Legal threshold yields internal review preparation only, never legal action or advice.

## Human decisions and write permission

`HumanDecision` preserves both the shown recommendation and the chosen action, including divergence, actor, time, reason and evidence context. `recordHumanDecision()` does not mutate the recommendation. `applyHumanDecision()` is the narrow 5B.1 write path: accepted contact/follow-up records the decision and starts a wait; an explicitly chosen promise records its date; close records closure; other bounded choices record review. Recommendations can never invoke this write path themselves.

## Synthetic scenarios and simulation

The synthetic truth set proves routine overdue/contact, active promise/wait, broken promise/follow-up, payment claim/verification, mixed disputed and undisputed invoices, entity uncertainty, missing contact, legal-review threshold, zero-balance resolution, and human divergence. The simulation covers case opened → contact recommended → human decision → events appended → waiting projection → human-confirmed promise → wait → elapsed promised date → broken-promise condition → follow-up recommendation. It sends nothing and persists nothing.

## Tenant and evidence safety

Every projection and write takes explicit tenant context and rejects cross-tenant cases, invoices, events, or decisions. Reasons and conditions carry evidence references. No Client Zero data, external service, or model provider participates.

## Client Zero unknowns

Cadence, channel choice, message approval, promise-capture UX, payment-verification operations, dispute frequency, and legal-escalation practice remain open validation questions. No assumptions about them are encoded in 5B.1.

## Deferred to 5B.2+

Deferred work includes persistence adapters/migrations, full promise capture, communication preparation and providers, message approval, delivery events, richer payment reconciliation, operator UI for decisions, legal workflow, bulk operations, AI assistance, real Client Zero ingestion, and any ConcilIA integration.
