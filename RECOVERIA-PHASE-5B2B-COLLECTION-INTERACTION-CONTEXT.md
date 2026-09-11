# RecoverIA Phase 5B.2B — Collection Interaction Context

## Interaction semantics

The domain-first module in `src/modules/collection-interactions` represents typed facts between contact eligibility and the existing deterministic next-action engine. `CONTACT_ATTEMPTED`, `CONTACT_DELIVERED`, and `RESPONSE_RECEIVED` are independent immutable facts. An attempt never proves delivery, delivery never proves response, and absence of a response never creates a synthetic no-response fact or elapsed-time rule.

Each interaction is tenant-, case-, and administration-scoped and may reference a known contact, channel, and one or more case invoices. It records explicit occurrence time, actor/source, and evidence. `appendInteractionFact()` appends and freezes facts without rewriting history.

## Promise model and status

A canonical promise requires a positive amount in minor units, a specific promised date, at least one in-case invoice, a human confirmer, and evidence. It may cover one or multiple invoices, and multiple simultaneous promises remain independently visible.

Promise status is derived at an explicit `asOf`:

- `ACTIVE`: date has not passed and confirmed financial allocations are insufficient.
- `BROKEN`: date passed without sufficient confirmed financial fulfillment.
- `FULFILLED`: confirmed financial evidence allocated to that promise meets or exceeds its amount.
- `SUPERSEDED`: a later human-confirmed promise explicitly supersedes it.

Partial confirmed payment never silently fulfills a promise. Superseded promises remain in chronology and the explicit historical collection.

## Payment claims

A `PaymentClaim` records that a human confirmed the claim was made; it does not confirm payment and cannot change balances. Claims retain invoice granularity, optional claimed amount/date, contact, evidence, and append-only supersession.

Status is `PENDING_VERIFICATION`, `VERIFIED`, `REJECTED`, or `SUPERSEDED`. Verification requires a human, decision-linked `PAYMENT_VERIFIED` collection event referencing the real claim and a compatible invoice. The existing financial ledger remains the only balance authority.

## Disputes

`InvoiceDispute` is always invoice-scoped and human-confirmed. The conservative reason taxonomy is `ALREADY_PAID`, `AMOUNT_QUESTIONED`, `INVOICE_INCORRECT`, `SERVICE_QUESTIONED`, `WRONG_RECIPIENT`, `OTHER`, and `UNCLASSIFIED`. `UNCLASSIFIED` is intentionally valid because no Client Zero taxonomy is assumed.

Derived status is `OPEN`, `RESOLVED`, or `SUPERSEDED`. Open disputes block routine collection for their invoice while unrelated invoices remain independently evaluable. Resolution/correction uses typed supersession with matching invoice scope; history is preserved.

## Chronology and current context

`deriveCollectionInteractionContext()` is a pure, deterministic read projection over collection events, interactions, promises, confirmed financial allocations, payment claims, disputes, and the 5B.2A contact resolution. It returns last attempt/delivery/response independently; all active, broken, fulfilled, and superseded promises; pending/verified/rejected/superseded claims; open/resolved/superseded disputes; relevant contacts; blockers; and a reverse chronological evidence-linked timeline.

No source object is mutated, no `Date.now()` is used, and no cadence or non-response threshold is encoded. Past interactions with a now-superseded contact remain valid chronology because 5B.2A now exposes that relationship as `INELIGIBLE` with blocker `SUPERSEDED` instead of dropping it.

## Collections-engine integration

`projectCollectionCaseWithInteractionContext()` adapts current typed promise, claim, dispute, and contact facts into the existing 5B.1 projection. It does not replace or write through the next-action engine. The engine itself now evaluates every effective promise event rather than allowing one latest promise to shadow another.

Existing ordered safety remains intact: a pending claim yields `VERIFY_PAYMENT`; a broken promise yields `FOLLOW_UP` only where its invoice is not disputed; a disputed broken promise yields `REVIEW_DISPUTE`; active promises can yield `WAIT`; and invoice-level disputes do not erase unrelated collectible invoices. The singular case recommendation retains evidence explaining the winning rule.

The four-invoice synthetic case preserves simultaneously: an active promise on invoice A, an open dispute on B, a pending payment claim on C, and ordinary overdue debt on D. The context exposes all four; current precedence selects payment verification while retaining dispute, promise, and collectible-invoice evidence.

## Human confirmation and correction boundary

Canonical promises, claims, and disputes require non-empty human confirmation and evidence at runtime. Typed corrections require an existing same-tenant/same-case predecessor, compatible invoice scope, and a linear supersession chain; forks fail closed. Future AI may propose facts but cannot create canonical truth. No AI proposal mechanism exists in this phase.

## Synthetic truth set

Behavioral tests cover attempt without delivery, delivery without response, response without promise, active/broken/fulfilled/partially fulfilled promises, pending and sanctioned-verified claims, open/resolved disputes, simultaneous promises, superseded promises, the mixed four-invoice case, historical superseded-contact chronology, cross-tenant rejection, chronology order/evidence, immutability, determinism, no mutation, no `Date.now()`, financial safety, and existing 5B.1/5B.2A safety.

## Persistence gap

No Prisma change or migration is made. Existing `CollectionEvent` and `PromiseToPay` vocabulary does not losslessly represent the typed interaction distinctions, multi-invoice promises, explicit claim lifecycle, invoice dispute history, financial fulfillment allocations, or typed supersession. Existing contact persistence also retains the reconciliation gaps documented in 5B.2A. A dedicated persistence-reconciliation phase is required before durable production state.

## Client Zero unknowns and deferred communication behavior

Delivery evidence sources, response interpretation, promise capture conventions, payment-claim review, dispute taxonomy, fulfillment allocation, cadence, channel preference, operator roles, and escalation practice remain unvalidated Client Zero assumptions.

Deferred to 5B.3+ are persistence, message drafting, sending, providers, inbox sync, scheduling, cadence, next-contact dates, automated reminders, contact-choice recommendations, invoice-level action queues, AI proposals, autonomous agents, legal execution, and real-data integration. This phase sends nothing and schedules nothing.
