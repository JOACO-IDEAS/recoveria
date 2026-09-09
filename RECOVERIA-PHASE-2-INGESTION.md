# RecoverIA Phase 2 Ingestion

## Implemented scope

Phase 2 implements a deterministic, in-memory ingestion proof over 40 synthetic documents. The pipeline classifies bytes, selects a parser adapter, emits raw source-addressed records, normalizes and validates each field, generates administration candidates, reports exact/business duplicates, isolates failures, and returns an import summary. The Prisma contract adds durable import summaries, document outcomes, separate invoice-import candidates, and duplicate findings; no database was provisioned or written. It does not persist candidates as confirmed invoice truth, call OCR/AI, use external services, or process real data.

## Pipeline behavior

1. `DocumentInput` carries document ID, tenant, filename/media hint, and bytes.
2. `classifyDocument` inspects signatures/content; extensions and MIME alone are insufficient for PDF/XLSX.
3. The selected parser emits one or more `RawInvoiceRecord` objects and cell/page/span evidence.
4. `buildInvoiceCandidate` creates separate raw and normalized values with field statuses.
5. `validateInvoiceCandidate` emits stable review reasons for required/invalid/conflicting fields.
6. Deterministic administration aliases produce zero, one, or multiple candidates; confirmation is always null in Phase 2.
7. `DuplicateDetector` reports content-hash equality separately from a tenant/issuer/number/date/amount/currency business key.
8. `ImportOrchestrator` catches errors per document and produces batch counts. Tenant plus idempotency key returns the same completed result.

## Batch result for corpus v1

- Documents received: 40
- Documents with parsed invoice candidates: 34
- Invoice candidates: 42
- Documents routed to extraction/duplicate review: 9
- Exact/possible duplicate documents: 2
- Unsupported: 1
- Failed: 1
- Scan/OCR review: 4

Unsupported and failed documents remain explicit outcomes; neither invalidates successfully processed siblings.

## Security and scale boundaries

All documents in one run must match the authorized tenant or the batch is rejected before parsing. Parsers receive bytes and return structured evidence; no content is logged or written to temporary files. The Phase 2 implementation is intentionally in-memory for a compact corpus. Before large or real imports, add size/count limits, streamed staging, private storage, malware scanning, worker isolation/timeouts, bounded concurrency, durable leases/checkpoints, retry/dead-letter state, and sensitive-log tests.

## Not implemented

Persistence of import results, queue/worker infrastructure, legacy XLS parsing, general-purpose PDF layout extraction, production OCR, asynchronous resume across process restarts, and automatic entity confirmation are later gates.
