# RecoverIA Phase 1 Data Model

## Implemented boundary

The Prisma schema is the persistence contract for a tenant-scoped receivables system. Phase 1 does not provision or connect to a database; the migration is generated from the validated schema for later review. Pure TypeScript fixtures exercise the same business semantics without external services.

## Aggregates and responsibilities

- **Organization / Membership:** the SaaS tenant and server-authorized user role. Every business/evidence record carries `organizationId` even when the tenant could be reached transitively. This makes scoping explicit in queries, indexes, jobs, and audit trails.
- **Party:** one normalized actor with a set of operational roles (`ISSUER`, `DEBTOR`, `ADMINISTRATION`). Administration is a Party role, not a second identity table. Role does not establish legal liability.
- **Building:** a separately identifiable consorcio/building. `AdministrationBuilding` is time-aware and evidenced because management can change.
- **Contact / ContactPoint / ContactAssociation:** people, channels, and their time-aware association with either Party or Building remain separate. Association means operational relevance, not legal authority.
- **ImportBatch / SourceDocument / ExtractionResult / ExtractedField:** immutable custody and extraction observations. A document may have multiple versioned extraction runs.
- **EntityResolutionEvidence / EntityResolutionDecision:** ranked candidates are observations; decisions are append-only and can supersede earlier decisions. Raw text remains on `ExtractedField`.
- **Invoice:** issued commercial document, explicitly linked to issuer and optionally billed-to Party, Building, and source. `billedToPartyId` is deliberately named instead of `debtorId` to avoid declaring liability.
- **Receivable / ReceivableLedgerEntry:** the receivable is an account anchored to one invoice and currency. Its balance is the signed sum of immutable entries. No mutable `currentBalance` column exists.
- **CollectionCase / CollectionCaseReceivable / CollectionEvent:** a case groups receivables in one currency and carries chronological evidence. The schema can later record prepared/approved/sent events while Phase 1 creates only synthetic non-external events.
- **PromiseToPay:** recorded terms/status with evidence, not an automatically accepted agreement.
- **ReviewTask / LegalReviewFlag:** workflow items separate data uncertainty and legal review from financial truth. A legal flag records the configured policy/version/threshold and observed age; it is not a conclusion.

## Financial semantics

Amounts use PostgreSQL `Decimal(18,2)` and three-character currency codes. Pure services use signed integer minor units to avoid floating-point errors. `INVOICE_ISSUED` increases balance; `PAYMENT`, `CREDIT`, and an authorized future `WRITE_OFF` reduce it; `ADJUSTMENT` may be signed but needs evidence. There is no inflation, interest, or FX conversion. A dispute changes workflow state but does not silently erase the receivable.

## Integrity decisions

- Business identifiers are tenant-scoped; tax IDs and invoice numbers are never globally unique.
- Import and ledger writes have tenant-scoped idempotency keys.
- Source content hashes are tenant-scoped and duplicates are reviewable.
- Case currency is explicit; application services must reject cross-currency grouping.
- Cross-aggregate writes must verify matching `organizationId` in a transaction. The pure boundary tests demonstrate the rejection contract; Phase 1 does not claim PostgreSQL RLS is active.
- Evidence/event records use restrictive deletion and append/supersession. Database privileges/triggers that prohibit updates are deployment concerns and must be added before real data.

## Deferred intentionally

Authentication provider, database/RLS provisioning, object storage, parser implementation, invoice lines, payment allocation across multiple invoices, credit-note documents, general ledger integration, communications, AI, and legal determination remain outside Phase 1.
