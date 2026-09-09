# RecoverIA Parser Architecture

## Contracts

- `DocumentClassifier`: signature/content-based `PDF_NATIVE`, `PDF_SCANNED`, `CSV`, `XLSX`, `UNSUPPORTED`, or `MALFORMED` plus evidence.
- `ParserAdapter`: `parse(documentId, bytes) -> RawInvoiceRecord[]` so multi-row structured files naturally yield multiple candidates.
- `PdfTextParser`: extracts labeled native text blocks with page/text-span evidence.
- `ScannedPdfAdapter`: explicit offline boundary returning `OCR_REQUIRED_OFFLINE_ADAPTER_NOT_IMPLEMENTED` and no fabricated fields.
- `CsvInvoiceParser`: deterministic UTF-8 comma/quoted-cell parser with row/column evidence.
- `SpreadsheetInvoiceParser`: ExcelJS XLSX workbook adapter with worksheet cell addresses.
- `NormalizationService`: pure name, CUIT, Argentine amount, and date functions.
- `ValidationService`: stable review codes for missing, conflicting, invalid, non-positive, or chronologically inconsistent fields.
- `DuplicateDetector`: SHA-256 exact-document detection and a separate possible-business-duplicate key.
- `ImportOrchestrator`: per-document isolation, tenant rejection, idempotent batch result, and summary.

Format adapters know files but not persistence. Candidate construction knows field semantics but not workbook/PDF libraries. Entity signals know a tenant-scoped catalog but cannot confirm an entity.

## Evidence/status model

Each field has `raw`, `normalized`, `status`, `evidence[]`, and `issues[]`. Evidence records the document and page/text span, CSV row/column, or worksheet row/cell column. Status is semantic (`EXTRACTED`, `UNCERTAIN`, `AMBIGUOUS`, `MISSING`, `UNSUPPORTED`, `FAILED`); no global confidence score exists.

## Important limitations

The native PDF fixture adapter intentionally supports a labeled, uncompressed text-operator subset used by the deterministic corpus. It proves routing/evidence contracts, not broad PDF compatibility. Phase 2 must not claim production PDF coverage until representative authorized documents are evaluated behind a robust parser. CSV currently supports UTF-8 comma-delimited files. XLSX is supported; legacy binary XLS is an explicit future adapter. ExcelJS loads a workbook in memory, so production limits and worker isolation are required.

## Future asynchronous boundary

One durable job per document should load a private staged object, validate tenant/job lease, parse with time/memory limits, append an extraction result, and checkpoint. At-least-once delivery requires tenant-scoped idempotency for document hashes, extraction versions, and candidate writes. No production queue was created.
