# RecoverIA Import Review Contract

## Review item payload

A future UI can render the current contract directly:

- tenant/import/document/candidate identity;
- document classification and classifier evidence;
- field name and semantic status;
- exact raw value;
- proposed normalized value;
- page/span or row/cell source location;
- candidate entity IDs and deterministic matching basis;
- stable review reasons;
- duplicate type, matched document, and evidence;
- explicit `confirmedEntityId: null` until a human/authorized later policy decides.

## Required review reasons

- `INVOICE_NUMBER_REQUIRES_REVIEW`
- `AMOUNT_REQUIRES_REVIEW`
- `INVOICE_DATE_REQUIRES_REVIEW`
- `DUE_DATE_REQUIRES_REVIEW`
- `CURRENCY_REQUIRES_REVIEW`
- `ISSUER_REQUIRES_REVIEW`
- `ADMINISTRATION_MISSING`
- `ADMINISTRATION_REQUIRES_REVIEW`
- `DUPLICATE_REQUIRES_REVIEW`
- `OCR_REQUIRED_OFFLINE_ADAPTER_NOT_IMPLEMENTED`
- `UNSUPPORTED_DOCUMENT`
- `MALFORMED_DOCUMENT` / `PARSER_FAILED`
- validation codes such as `NON_POSITIVE_AMOUNT`, `INVALID_CURRENCY_CODE`, and `DUE_DATE_BEFORE_INVOICE_DATE`

Missing optional fields stay null and evidenced as missing; they are never synthesized. Missing due date, invoice number, date, amount, currency, or issuer blocks automatic acceptance. An administration mention with zero/multiple candidates requires review. Even a single candidate is not a confirmed entity in Phase 2.

## Duplicate semantics

An exact document duplicate is byte-identical within a tenant (SHA-256). A possible business duplicate shares tenant, normalized issuer, invoice number, invoice date, amount, and currency but has different bytes. Both are retained and explained. Neither is silently deleted or persisted as confirmed truth.

## Outcome actions

Phase 2 results may be `PARSED`, `REVIEW_REQUIRED`, `UNSUPPORTED`, or `FAILED`. Future human actions can confirm, correct, reject, mark no-match, or accept a justified duplicate relationship by appending evidence decisions. This phase implements no UI and makes no persistence mutation from candidates.
