# RecoverIA Phase 4.6A — Sanitized Client Zero invoice discovery

## Scope

This discovery examined the complete authorized cohort of 20 private PDF invoices. The originals remained inside the ignored Client Zero boundary and were not imported, copied into fixtures, or used to create production entities or collection cases. This document contains structural and aggregate findings only.

## Cohort correction

The supplied “2011 historical cohort” label is contradicted by the invoice issue dates. The invoices span late 2024 through late 2025. A repeated 2011 date belongs to issuer registration metadata, not invoice chronology. RecoverIA must distinguish issuer metadata from document dates and must not silently privilege a human cohort label over document evidence.

This remains a limited historical discovery cohort and is not evidence of the complete current portfolio.

## Document findings

- All 20 files are readable, single-page PDFs using one stable visual template.
- The cohort contains two point-of-sale numbering series associated with different billing patterns.
- No exact byte duplicates or exact business-key duplicates were observed.
- Text and font structures exist in the PDFs, but the current parser cannot decode their real encoding/layout. Image resources are also present, so a robust extractor needs layout-aware native-text handling plus an OCR fallback.
- Every invoice visibly contains document type, invoice identifier, issue date, fiscal authorization metadata, issuer and customer tax identifiers, customer/property address, currency, description, tax transparency information, and a nominal total.
- None visibly contains a payment due date, administration name, prior balance, explicit payment status, bank instructions, or explicit interest terms.
- The printed fiscal-authorization expiry date is not a payment due date.
- A minority explicitly identifies a billing month. Several project invoices instead contain quotation dates or installment-stage wording in free text.

## Extraction reliability

| Category | Reliability | Finding |
|---|---|---|
| Document type, invoice identifier, issue date, fiscal authorization, tax IDs, currency, nominal total | High for human inspection; unsupported by the current parser | Stable and visually clear, but not encoded in the synthetic label/value form expected today |
| Customer identity | High from tax ID; medium from address; low from displayed name alone | The displayed customer phrase is generic across the cohort |
| Service period | High when explicitly printed; otherwise unavailable | It must not be inferred from quotation or invoice dates |
| Project/installment relationship | Medium | Free-text stage signals require normalization and review |
| Administration, payment due date, prior balance, payment status, interest | Unavailable | Not present in the invoice evidence |

## Cross-document patterns

- One issuer recurs across the cohort.
- Seven customer/property identities are distinguishable by tax identifier and address.
- Recurring maintenance and one-off project work coexist.
- Recurring monthly charges may repeat customer, description, and amount while remaining distinct invoices.
- Some project invoices are complementary advance/balance or numbered-installment stages. Similar amounts and descriptions therefore provide relationship evidence, not automatic duplicate proof.
- Some apparent counterpart stages are outside the cohort or cannot be established from invoices alone.

## Fact, inference, and unknown

FACT:

- The documents exist and state nominal totals.
- Issue dates fall in late 2024 through late 2025.
- Fiscal authorization expiry, when shown, is distinct from payment due date.
- Recurring and staged billing patterns appear in the cohort.

INFERENCE:

- Documents sharing a customer, quotation signal, work description, and complementary stage wording probably belong to one project relationship.
- A stage whose counterpart is absent likely relates to a document outside the cohort.

UNKNOWN:

- Whether any invoice was paid, partially paid, credited, reversed, settled, disputed, acknowledged, or remains outstanding.
- The current balance, economic reference value, legal status, enforceability, and any prescription chronology.

## Current-receivable evidence gap

The evidence chain is:

`INVOICE EXISTS → PAYMENT STATUS → CURRENT BALANCE → SUBSEQUENT EVENTS → CURRENT RECEIVABLE STATUS`

These PDFs support only the first link. The remaining links require accounting-ledger entries, bank/payment records, receipts and allocations, credit/debit notes, write-offs, settlements, payment agreements, acknowledgments, collection correspondence, formal notices, mediation evidence, and judicial records. None was searched for in this phase.

Invoice existence must never initialize a current outstanding balance without separate evidence.

## Economic and legal boundaries

The stated invoice total supports documented nominal capital, subject to reconciliation of staged project billing. An eventual economic reference value would additionally require an approved reference-date rule, currency/regime policy, index series and version, methodology, rounding policy, calculation date, and treatment of subsequent financial events.

`ECONOMIC REFERENCE VALUE != LEGALLY CLAIMABLE AMOUNT`

No economic reference value was calculated. No legally claimable amount, enforceability result, or prescription conclusion was calculated. Legal chronology evidence is insufficient because the invoices omit payment due dates and later chronology-changing events.

## Fit against the current model

### Supported as-is

- Tenant-scoped source documents and immutable evidence references.
- Invoice number, issue date, currency, total, issuer, billed party, and building concepts.
- Tax-ID signals, human-reviewed entity resolution, duplicate review states, and a separate receivable ledger.

### Needs normalization

- Preserve point of sale and invoice sequence.
- Normalize local currency labels while retaining raw evidence.
- Prefer tax-ID and address evidence over a generic displayed customer name.
- Normalize addresses and free-text service/stage signals without erasing provenance.
- Keep fiscal authorization expiry separate from payment due date.

### Missing model concepts

- Fiscal authorization identifier and expiry.
- Invoice subtype/code and tax-condition metadata.
- Service/billing period.
- Quotation reference/date.
- Project/installment grouping, stage type, ordinal/count, and percentage.
- Explicit separation of documented nominal amount, current outstanding balance, economic reference value, and legal-policy result.
- Documented tax component distinct from subtotal and total.

### Wrong assumptions

- A payment due date cannot be required for every invoice.
- Validity cannot be determined by looking for a PDF EOF marker only in the first bytes of a larger file.
- Real PDF extraction cannot assume synthetic literal `LABEL:value` text operators.
- Administration cannot be assumed present, and a generic customer phrase cannot safely resolve a debtor.
- An invoice total cannot be treated as a present outstanding balance.

### Document-understanding gap

A future extractor needs true PDF text decoding and layout reconstruction, OCR fallback, page/region provenance, correct fiscal-date classification, and confidence-aware human review for service periods and installment relationships.

## Recommended next step

Request a bounded, authorized accounting-evidence package for the same invoice set: receivables-subledger entries, receipts/payment allocations, and credit/debit notes with dates and stable source references. Then undertake Phase 4.6B as a design and private-evaluation phase for the real-document ingestion contract. Do not begin production ingestion or collections from invoice evidence alone.
