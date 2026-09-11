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

## Phase 5B.1A Safety Hardening

Material events now require a unique real `HumanDecision` in the supplied in-memory decision registry. The decision tenant, case and human actor must match the event; a truthy or fabricated decision ID is insufficient. `applyHumanDecision()` reprojects the supplied current case before writing and rejects stale recommendations or actions that are incoherent with the current workflow and blockers.

The sanctioned material paths now include explicit payment confirmation, dispute opening and dispute resolution. `VERIFY_PAYMENT` remains an investigative next action: only the separate `CONFIRM_PAYMENT` human operation can append `PAYMENT_VERIFIED`, and it must reference a real effective payment claim with compatible invoice scope. The similarly bounded `OPEN_DISPUTE` and `RESOLVE_DISPUTE` operations require `REVIEW_DISPUTE` and an in-case invoice; resolution must target a currently disputed invoice. These operations do not expand the recommendation taxonomy.

Corrections remain append-only and now obey explicit invariants: the superseded event must exist in the same tenant and case, invoice scope is preserved, event types must match, and materiality is inherited for authorization purposes. Supersession is a linear chain (`A → B → C`); a second correction branching directly from an already superseded event is rejected.

Safety context precedes collection urgency. A broken promise attached to a disputed invoice routes to dispute review rather than follow-up. Legal-review preparation may remain the case-level recommendation, but an active dispute is included as an evidence-linked blocker. A zero financial balance remains visible as a fact, while an open dispute or unverified payment claim keeps the workflow in review and prevents a silent clean-close recommendation.

Persistence, durable idempotency, optimistic concurrency, multi-operator locking, network retries, communication send states, pre-send revalidation, full recommendation versioning, and real-world promise/dispute models remain deferred.

### Persistence vocabulary reconciliation prerequisite

**Persistence vocabulary reconciliation required before collections-engine persistence is implemented.** The existing Prisma schema already represents `CollectionCase`, `CollectionEvent`, `PromiseToPay`, and `LegalReviewFlag`, while the TypeScript engine uses its own bounded workflow states, composable conditions, event types, decision operations and recommendation actions. Their names, lifecycle semantics, relationships, actor/decision authorization metadata, correction/supersession semantics, and invoice scope have not yet been mapped. No Prisma model or migration is changed in 5B.1A; an explicit reconciliation design is a prerequisite for a future persistence phase.

## Client Zero unknowns

Cadence, channel choice, message approval, promise-capture UX, payment-verification operations, dispute frequency, and legal-escalation practice remain open validation questions. No assumptions about them are encoded in 5B.1.

## Deferred to 5B.2+

Deferred work includes persistence adapters/migrations, full promise capture, communication preparation and providers, message approval, delivery events, richer payment reconciliation, operator UI for decisions, legal workflow, bulk operations, AI assistance, real Client Zero ingestion, and any ConcilIA integration.
