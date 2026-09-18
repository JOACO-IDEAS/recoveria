# RecoverIA Phase 4.6B.1 — Real Invoice Intelligence Hardening

## Objective

Phase 4.6B proved RecoverIA could extract fields from real invoices one at a
time. This phase answers a different question: can RecoverIA turn a *cohort*
of real documents into evidence-backed customer identities and document
relationships — without inventing balances, payment status, administration
identity, or legal conclusions? It audits and extends the existing document-
understanding and entity-resolution architecture rather than building a
parallel one.

## Architecture reused unchanged

- `DeterministicDocumentUnderstandingProvider` / `ImportOrchestrator` — the
  only ingestion boundary; untouched.
- `pdf-text-parser.ts` / `local-pdf-decoder.ts` — real PDF decoding into
  `StructuredDocumentUnderstanding` with observation-level provenance;
  untouched.
- `DuplicateDetector` — exact/business-key duplicate detection; untouched,
  and never fed by the new relationship engine (duplicate detection and
  relationship proposal remain two independent, non-overlapping concerns).
- `entity-resolution/resolver.ts` + `memory.ts` — catalog-based identity
  resolution and the append-only human `DecisionEvent`/alias-confirmation
  mechanism. This remains the *only* path by which a proposal can ever
  become a confirmed entity. Reused verbatim.
- `normalizeCuit` / `normalizeName` / `normalizeDate` — reused by both new
  engines for consistent identity normalization.

## New components (both pure, deterministic, no ML/LLM)

### `src/modules/ingestion/document-relationships.ts`

The missing cross-document layer. Every field in
`StructuredDocumentUnderstanding` was already per-document; nothing compared
documents to each other except exact/business-key duplicate hashing. This
engine proposes, pairwise, across a cohort:

`POSSIBLE_SAME_CUSTOMER`, `POSSIBLE_SAME_SERIES`, `POSSIBLE_RECURRING_SERVICE`,
`POSSIBLE_INSTALLMENT_OF`, `POSSIBLE_ADVANCE_FOR`, `POSSIBLE_BALANCE_FOR`,
`POSSIBLE_PROJECT_GROUP`, `POSSIBLE_COUNTERPART` — reusing the existing
`POSSIBLE_`-prefixed naming convention from the per-document
`RelationshipCandidate` type, since none of these may ever imply certainty.

Every proposal carries `confidence`, `classification` (always `INFERENCE`),
`status` (`PROPOSED` / `AMBIGUOUS` / `CONTRADICTED`), `supportingSignals`,
`contradictingSignals`, `reviewRequired`, `documentIds`, and `evidence`. A
document whose stage/quotation signal finds no cohort counterpart is reported
separately as an `UnmatchedRelationshipSignal`, never silently completed.

Deliberate abstention, by construction: a bare customer-name match with no
tax id and no address never produces a proposal — the real cohort showed the
displayed customer phrase is generic, so name similarity alone is not
evidence. A same-amount, same-month pair with no identity corroboration
produces nothing. Two documents with the same name but a *different* tax id
produce an explicit `CONTRADICTED` proposal — flagged, never merged.

### `src/modules/entity-resolution/cohort-clustering.ts`

Answers "which raw documents probably describe the same real-world customer?"
*before* any catalog exists — a genuinely different question from
`resolveEntity`, which requires a catalog. Groups a source-agnostic
`CustomerIdentitySignal[]` (deliberately not tied to PDFs — a future
`CatedralAdapter`/`ContactImportAdapter` can produce the same shape and feed
this same function) into `IdentityClusterProposal[]` using
`ProposalStatus = PROPOSED | AMBIGUOUS | CONTRADICTED | UNKNOWN`.

This module has no field capable of expressing an `EntityType` or an
administration assignment — a customer can never become an Administration by
passing through it, structurally, not just by convention. Promotion to an
actual entity is exclusively the existing `resolveEntity` +
`DecisionEvent`/alias-confirmation path.

## Invariants (machine-tested)

`src/modules/ingestion/abstention.test.ts` is a dedicated, checklist-style
test file proving each of the following, by name:

1. Invoice exists ≠ invoice currently unpaid — no payment-status field exists
   anywhere in document understanding.
2. Documented nominal total ≠ current balance — `outstandingCents()` returns
   `0`, not the invoice total, when no ledger entry exists at all; a balance
   requires explicit evidence, never invoice existence alone.
3. Customer ≠ administration — identity clusters have no `entityType` /
   `administrationId` field.
4. Address similarity ≠ same legal entity — address-only matches stay
   `LOW` confidence and `reviewRequired`, never promoted.
5. Same amount + recurring month ≠ duplicate — the relationship engine
   produces nothing from amount+date alone; `DuplicateDetector`'s own
   existing tests already prove recurring/staged invoices are not collapsed.
6. Old invoice ≠ prescribed debt — `requiresLegalReview` stays a boolean
   review trigger; no prescription/legal-outcome type exists to call instead.
7. No due date found ≠ issue date is due date — `PAYMENT_DUE_DATE` is never
   backfilled from `ISSUE_DATE`.
8. Installment signal ≠ all installments exist in the cohort — unmatched
   signals are reported explicitly rather than assuming completeness.
9. No payment evidence ≠ no payment occurred — the domain vocabulary has no
   absolute "never paid" state; every label is relative to evidence
   RecoverIA currently holds.

A tenth test locks in the **cross-source future contradiction model**: feeding
`resolveEntity` a second, hypothetically-Catedral-sourced signal that
contradicts an invoice-derived tax id returns `CONFLICT`, never a silent
overwrite — proving the existing resolver already satisfies the fusion model
Phase 4.6B.1 was asked to design for.

## Real-cohort aggregate results (sanitized)

Ran unchanged against all 20 authorized real PDFs via the extended
`scripts/ingestion/evaluate-local-pdfs.ts` private harness. Detailed,
document-level output stays inside `.private/client-zero/analysis/`; only
aggregate counts are reported here.

| Measure | Result |
|---|---:|
| Documents processed | 20/20 |
| Full core extraction (unchanged from 4.6B) | 20/20 |
| Identity clusters proposed | 7 |
| Identity clusters requiring review | 0 |
| Document relationship proposals | 229 |
| — high confidence | 50 |
| — medium confidence | 179 |
| — ambiguous | 0 |
| — contradictions | 140 |
| — marked review-required | 179 |
| Unmatched relationship signals (abstentions) | 9 |

The 7-cluster result independently reproduces Phase 4.6A's manual finding of
seven tax-ID-distinguishable customer identities, using an unrelated,
automated method — real cross-validation, not a coincidence of tuning. The
140 contradictions are the expected signature of the already-documented
generic-customer-name problem: the engine correctly refuses to merge on name
alone and instead flags every cross-tax-id, same-name pair it finds, rather
than silently resolving or silently dropping the conflict.

## What this phase does not claim

No current balance, payment status, administration identity, contact
identity, legal status, prescription conclusion, or collectible amount was
computed, inferred, or persisted for any of the 20 real documents. No
`EntityRecord` was created. All 229 relationship proposals and 7 identity
clusters remain proposals, not truth, pending human confirmation through the
existing `DecisionEvent` mechanism.

## Catedral readiness

The target future shape is:

`CatedralAdapter → Canonical Accounting Observations → Evidence-linked Allocation/Receivable Reconstruction → Current Balance`

No `CatedralAdapter` or accounting-export parser was built this phase — none
was authorized or needed yet. What *is* already ready: `SourceEvidence.location.kind`
is an open union (`"PDF_TEXT" | "CSV_CELL" | "SHEET_CELL"`, extensible later
to something like `"ACCOUNTING_EXPORT_ROW"`); `ResolutionSignal.sourceRefs`
and `Candidate.contradictingEvidence` are already source-agnostic; and the new
`CustomerIdentitySignal` shape can be produced by a future Catedral adapter
without a second clustering engine.

**What Catedral must actually provide before Phase 4.6C can begin:**
receivables-subledger entries, receipts/payment allocations, and credit/debit
notes with stable source references, per invoice/customer. Critically, the
current `LedgerEntryRecord` model ties one entry to exactly one `invoiceId`;
it already supports many entries against one invoice (N:1), but a single
payment split across multiple invoices (true M:N allocation) is **not yet
representable** and will require a new allocation-record concept
(`{paymentId, invoiceId, amountCents}` rows) before real balance
reconstruction can begin. This is a design note only — no allocation model
was implemented this phase.

## Contact-data readiness

Target relationships: `Administration ↔ many Contacts`,
`Administration ↔ many Consortia`, `Contact ↔ one or many Administrations`,
each with phone/WhatsApp/email, role, source, confidence, and temporal
validity. The current `ContactRecord` (used by the Product Surface
demo/domain layer) models exactly one optional `administrationId` and one
optional `buildingId` per contact — a 1:1-shaped assumption that will need to
become a join-table shape later. This was **not** changed this phase: the
Product Surface's synthetic data and tests depend on the current shape, real
contact data is not yet authorized for use, and the task explicitly asked for
minimal primitives only if truly necessary to avoid rework. No rework is
being avoided by acting now, so nothing was implemented — this is recorded
purely as a forward-looking design note.

## What remains blocked

- Phase 4.6C balance reconstruction — requires the Catedral accounting
  package above; not started.
- Any promotion of the 7 real identity clusters into actual `EntityRecord`s —
  requires an explicit human `DecisionEvent` per cluster, not performed here.
- Contact ingestion and outbound communication — out of scope by instruction,
  untouched.
- Product Surface — untouched by instruction; no file under
  `src/app`, `src/components` (product surface), or `src/lib/demo` was
  modified this phase.
