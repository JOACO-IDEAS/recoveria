# RecoverIA Ingestion Design

## Goal and boundary

Phase 1+ ingestion converts authorized files into reviewable evidence. Phase 0 implements none of this pipeline. Real Christophersen Ascensores files remain prohibited until the controlled real-data gate.

## Pipeline

1. **Accept and stage** — create ImportBatch; enforce extension/MIME/size/count limits; stream to private quarantine storage; record SHA-256 and idempotency key.
2. **Safety and classification** — malware scan, file-signature check, encrypted/corrupt-file detection, duplicate detection, and document-class confidence.
3. **Route cheaply**:
   - CSV: encoding/delimiter detection, header mapping, row validation.
   - XLS/XLSX: workbook parser, explicit sheet/header selection, formulas treated cautiously, row/cell coordinates retained.
   - Native-text PDF: text extraction plus page/span references; assess text coverage before any OCR.
   - Scanned/image PDF: OCR only after low-text/quality detection, page by page, retaining OCR engine/version and bounding boxes.
4. **Extract invoice candidates** — deterministic patterns and schema mappings first; optional schema-constrained model extraction only for unresolved fields. Extract invoice number/date/due date/amount/currency/issuer/debtor/tax ID/building/administration/address/description/payment-status evidence.
5. **Normalize without overwriting** — parse dates/currency/tax IDs and create normalized candidates alongside raw values.
6. **Resolve entities** — exact tenant-scoped identifiers first, then normalized aliases/address/relationship context, then ranked uncertain candidates. Auto-confirm only under a separately approved calibrated threshold; otherwise create ReviewTask.
7. **Validate and commit** — balanced amounts, plausible dates, duplicate invoice checks, required evidence links, and atomic creation of invoices/receivables/events.
8. **Project and report** — update batch counts, aging projections, data-quality queues, and retry/dead-letter status.

## Adapter contracts

`DocumentClassifier` identifies structure and confidence. `DocumentParser` returns source-addressed content blocks. `InvoiceExtractor` returns typed field observations, never database entities. `Normalizer` returns candidates plus warnings. `EntityResolver` returns ranked candidates and evidence features. `ImportWriter` commits tenant-scoped records transactionally. Vendor libraries remain behind these contracts.

## Evidence envelope

Every observed field carries: tenant/import/document IDs; parser and extractor version; raw value; candidate normalized value; confidence; page/sheet/row/cell or bounding box; surrounding text hash/snippet within retention policy; timestamp; and warnings. Human decisions add actor, reason, prior value, and decision time.

## Reliability and scale

- Stream uploads and rows; do not load thousands of documents into a web request.
- One job per document plus bounded fan-out for pages; batch status is an aggregate.
- At-least-once jobs with idempotent writes, leases, exponential retry, and a visible dead-letter/review state.
- Hash-based duplicates are surfaced, not silently discarded; the user decides whether they represent duplicate evidence.
- Parser/model versions permit safe reprocessing into a new ExtractionRun.
- Import cancellation stops future work but retains an auditable partial result according to retention policy.

## Quality gates

Use synthetic fixtures covering clean CSV, localized decimals/dates, XLSX with multiple sheets, native PDFs, image PDFs, duplicate documents, ambiguous parties, missing fields, and corrupt/encrypted files. Measure field precision/recall, unresolved rate, false auto-match rate, cost/document, throughput, and reviewer correction time. Do not enable auto-confirmation until false matches are acceptably low and calibrated per signal.

## Payment-status caution

An invoice label or spreadsheet column is an observation, not sufficient truth by default. Persist the claimed status and its evidence; only set receivable balance from authoritative ledger/payment allocation rules approved in a later phase.
