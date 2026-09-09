# RecoverIA Domain Model

## Modeling stance

Phase 0 defines semantics and invariants; Prisma models and migrations begin only after Phase 1 approval. The minimum coherent model separates tenant identity, commercial parties, source evidence, accounting facts, collections workflow, and uncertain resolution.

## Proposed core

### Tenant and parties

- **Organization** — RecoverIA tenant/workspace. This must never be overloaded to mean consorcio.
- **UserMembership** — user, organization, role, status; the server-side authorization root.
- **Party** — normalized real-world legal or commercial actor with type `DEBTOR`, `ADMINISTRATION`, `ISSUER`, or multiple roles. Optional tax ID and normalized name are tenant-scoped.
- **PartyAlias** — observed/normalized names associated with a party, including provenance and confirmation state.
- **Building** — consorcio/building managed as a distinct entity: display/legal name, tax ID when available, and address.
- **AdministrationBuilding** — time-aware many-to-many relationship between an administration Party and Building. `validFrom`/`validTo` prevent assuming management is eternal.
- **Contact** — a person or shared contact point owner; does not itself imply authority.
- **ContactPoint** — email/phone/WhatsApp value, verification state, purpose, and links to a Party or Building through a relationship with validity and provenance.

This unifies Customer/Debtor and Administration where both are parties, while keeping Building separate because invoices and management relationships require its own identity and history.

### Documents, extraction, and resolution

- **ImportBatch** — tenant, origin category, status, counts, idempotency key, creator, and timestamps.
- **SourceDocument** — original object key, content hash, media type, byte size, filename, document kind, and immutable custody metadata. `InvoiceDocument` is represented by a typed link rather than a duplicate storage object.
- **DocumentLink** — typed relationship from SourceDocument to Invoice or other future aggregate.
- **ExtractionRun** — parser/model version, strategy, status, start/end times, and warnings.
- **ExtractedField** — field name, raw value, parsed candidate value, confidence, page/sheet/cell/coordinates or text span, and source reference.
- **ResolutionCandidate** — extracted mention, candidate target (`Party`, `Building`, or `Contact`), method, confidence/features, and rank.
- **ResolutionDecision** — `PENDING`, `CONFIRMED`, `REJECTED`, or `NO_MATCH`, with actor, timestamp, rationale, and chosen candidate.
- **HumanCorrection** — prior field/decision reference, corrected value, actor, reason, and timestamp. It never deletes the original.

The three identity layers are explicit: an `ExtractedField.rawValue`; zero or more normalized candidates; and an affirmative `ResolutionDecision`. Similar strings never silently merge records.

### Receivables

- **Invoice** — tenant, issuer Party, debtor Party when confirmed, Building when confirmed, invoice number, issue/due dates, currency, total, status, and provenance completeness. Uniqueness is tenant/issuer/number, not global.
- **Receivable** — monetary position arising from an invoice: original amount, outstanding amount, currency, state, and `asOf`. Keep this separate so payments/adjustments can produce a ledger rather than mutate invoice truth.
- **ReceivableEntry** — append-only debit/credit/adjustment/payment-allocation entries with effective date and source.
- **Payment** — observed payment evidence; may be unallocated, partially allocated, or disputed.
- **PaymentAllocation** — amount linking a Payment to a Receivable, preserving allocation history.

Totals and aging are projections from receivable entries at an explicit `asOf`, using due date and policy-defined buckets. Cross-currency totals are grouped by currency unless an explicit sourced FX policy exists.

### Collections and review

- **CollectionCase** — tenant-scoped work aggregate for one debtor and currency, optionally linked to one or many Receivables. Status and ownership are current projections.
- **CollectionEvent** — immutable case timeline: created, reviewed, assigned, contact attempted/recorded, dispute noted, promise recorded, and status changed. Facts identify actor and evidence.
- **PromiseToPay** — terms as reported, due date/amount/currency, state, source, and who recorded it; never interpreted as accepted automatically.
- **CommunicationDraft** — generated/prepared content, evidence snapshot, model/template version, state, creator, and required approver. A draft has no send capability.
- **CommunicationEvent** — immutable record of a human-approved external event when that later phase exists.
- **ReviewTask** — typed queue item linked to extraction, resolution, receivable, or case, with reason, priority signals, assignment, and resolution.
- **LegalReviewFlag** — configurable policy reference, calculated trigger facts, status, reviewer, and notes. It requests expert review and never asserts prescription or initiates action.

## Invariants

1. Every tenant-owned row and query is organization-scoped.
2. Original files, raw fields, and history events are immutable.
3. Confirmation records name the human/system actor and the evidence considered.
4. Invoice status is not inferred as paid unless payment/allocation evidence supports it.
5. A case cannot silently mix currencies; conversion requires a configured, evidenced policy.
6. Legal flags use tenant-configured rules and carry jurisdiction/context metadata; no universal deadline exists.
7. Drafting, approving, and sending are distinct capabilities. MVP omits sending.
8. Derived projections include `asOf` and version/policy metadata so results are reproducible.

## Deliberately deferred

Physical Prisma design, deletion/retention rules, exact party-role taxonomy, invoice line items, credit notes, disputes, accounting-system IDs, FX conversion, and case grouping policy require Phase 1 fixtures and stakeholder decisions.
