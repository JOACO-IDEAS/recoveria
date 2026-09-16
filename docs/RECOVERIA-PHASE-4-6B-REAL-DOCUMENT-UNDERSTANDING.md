# RecoverIA Phase 4.6B - Real document understanding foundation

## Outcome

RecoverIA now has a local, provider-neutral document-understanding path for real native-text PDFs. It preserves a staged contract:

`DOCUMENT -> OBSERVATION -> NORMALIZED CANDIDATE -> CONFIDENCE/STATUS -> HUMAN REVIEW`

The implementation was privately evaluated against all 20 authorized documents. Core document identity, issue date, fiscal authorization, customer tax identifier, currency, documented nominal total, and provenance were extracted for 20/20 documents without OCR, network access, database access, or production mutation. All results remain reviewable.

## Architecture

The existing `DocumentUnderstandingProvider` and ingestion orchestrator remain the only ingestion boundary. Native PDFs are decoded locally through `pdfjs-dist`; synthetic literal-PDF fixtures remain supported for backward compatibility. The new decoder emits provider-neutral observations before field interpretation.

Each text observation contains:

- source document reference;
- page number;
- observed text;
- rectangular page coordinates;
- extraction method;
- parser version;
- categorical confidence.

Normalized candidates reference observation identifiers. A decoded string is therefore evidence, not automatically domain truth. The boundary can later support `LOCAL_OCR`, `VISION_PROVIDER`, or `LLM_PROVIDER` without changing invoice truth semantics. No network provider was implemented.

## Local dependency

`pdfjs-dist` 5.4.296 was added as a pinned production dependency. It is Apache-2.0 licensed and supplies native PDF decoding and text positioning. The implementation uses only local bytes and does not perform network access. A small text-extraction matrix fallback avoids requiring native rendering support when only text observations are needed.

## Semantic dates

Dates are typed as:

- `ISSUE_DATE`
- `PAYMENT_DUE_DATE`
- `SERVICE_PERIOD_START`
- `SERVICE_PERIOD_END`
- `FISCAL_AUTHORIZATION_EXPIRY`
- `ISSUER_REGISTRATION_DATE`
- `OTHER_DATE`
- `UNKNOWN_DATE`

Fiscal-authorization expiry is never treated as payment due date. Issuer registration metadata is never treated as invoice date. A payment due date is created only from an explicit payment-due label; missing due dates remain unavailable and route to review.

## Evidence and uncertainty

Candidate fields use categorical confidence (`HIGH`, `MEDIUM`, `LOW`, `UNAVAILABLE`) and evidence classification (`FACT`, `INFERENCE`, `UNKNOWN`). Directly displayed document facts remain facts. Derived service-period boundaries and possible installment/project relationships remain inferences. Missing fields remain unknown rather than fabricated.

The private evaluation found:

| Measure | Coverage |
|---|---:|
| Core extraction | 20/20 |
| Document identity | 20/20 |
| Issue date | 20/20 |
| Fiscal authorization | 20/20 |
| Customer tax-identifier candidate | 20/20 |
| Currency | 20/20 |
| Documented nominal total | 20/20 |
| Page/region provenance | 20/20 |
| Explicit service-period candidates | 5/20 |
| Installment/stage candidates | 9/20 |
| Explicit payment due date | 0/20 |
| OCR fallback required | 0/20 |

The zero payment-due result is correct for the cohort and is not an extraction failure.

## Nominal-value boundary

The extracted total is explicitly named `documentedNominalTotalCents`. It does not initialize or imply:

- current outstanding balance;
- economic reference value;
- legally claimable amount;
- collection amount.

Those values require separate evidence and policy.

## Relationship and duplicate safety

Advance, balance, numbered-installment, and quotation signals create only non-definitive relationship candidates such as `POSSIBLE_STAGE_OF`, `POSSIBLE_INSTALLMENT_OF`, and `POSSIBLE_PROJECT_GROUP`. They never merge documents.

Existing exact-document and business-key duplicate detection remains non-destructive. Synthetic regression tests prove that recurring equal-value invoices and complementary stages with distinct invoice identifiers are not collapsed merely because amounts or descriptions are similar.

## Private evaluation boundary

The tracked evaluator accepts only an input below the private Client Zero invoice root and an output below the private analysis root. It uses an in-memory provider invocation, emits only aggregate counts to standard output, and writes detailed observations only to the ignored private boundary. It creates no entities, receivables, cases, communications, database records, or network calls.

## Tests

Tracked fixtures are entirely synthetic and cover:

- valid native-PDF decoding;
- page/region/method/version provenance;
- fiscal expiry versus payment due date;
- issuer registration date versus invoice date;
- absent due dates;
- documentary nominal value separation;
- service-period inference;
- non-definitive stage/project candidates;
- unavailable-field behavior;
- safe failure for PDFs without native text;
- recurring and staged duplicate safety.

## Remaining limitations

- Local OCR is an explicit but unimplemented fallback.
- Issuer branding fields are not inferred from fragile logo placement.
- Current line reconstruction and semantic labels focus on Latin-script Argentine invoice conventions.
- Complex tables, rotated text, handwriting, encrypted PDFs, and arbitrary multilingual templates need additional evaluation.
- Relationship candidates still require human confirmation and external project/contract evidence.
- Invoice extraction alone cannot establish payment status or current balance.

## Next evidence requirement

Before Phase 4.6C balance reconstruction, obtain an authorized, bounded accounting package for the same invoice scope: receivables-subledger entries, receipts/payment allocations, and credit/debit notes with stable source references. Invoice existence must not be promoted to current debt without that evidence.
