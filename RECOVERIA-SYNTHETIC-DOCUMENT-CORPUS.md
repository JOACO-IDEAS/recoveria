# RecoverIA Synthetic Document Corpus

## Corpus v1

`src/test/fixtures/document-corpus.ts` generates 40 deterministic, in-memory documents and an explicit truth manifest. All companies, CUIT values, addresses, invoice numbers, and contacts are invented. No files are read from Christophersen Ascensores.

| IDs | Count | Type | Expected behavior |
|---|---:|---|---|
| `pdf-1`–`pdf-20` | 20 | Native PDF | Clean extraction; includes Argentine separators, formatted/unformatted CUIT, Spanish date, prefix numbers, unusual field order, and six administration spellings |
| `pdf-21` | 1 | Native PDF | Missing due date remains null; review |
| `pdf-22` | 1 | Native PDF | Building only; administration remains null; review |
| `pdf-23` | 1 | Native PDF | `ADM. GARCIA S.R.L.` normalized; one candidate, no confirmation |
| `pdf-24` | 1 | Native PDF | Conflicting amounts and ambiguous `ADM SUR`; review |
| `pdf-25`–`pdf-28` | 4 | Scan-designated PDF | No native text; route to offline OCR review |
| `csv-29`–`csv-32` | 4 | CSV | Two invoices per document; eight candidates |
| `xlsx-33`–`xlsx-36` | 4 | XLSX | Two invoices per workbook; eight candidates |
| `doc-37` | 1 | Non-invoice text | Unsupported |
| `doc-38` | 1 | Malformed PDF | Failed in isolation |
| `doc-39` | 1 | PDF byte-for-byte copy | Exact-document duplicate of `pdf-1`; review |
| `doc-40` | 1 | Near duplicate PDF | Same business key as `pdf-2`, changed description; possible business duplicate; review |

The manifest records expected format, parser status, review requirement, duplicate type, and expected normalized invoice number/date/due date/amount/currency/issuer/billed party/CUIT/administration/building for every candidate.

## Truth-set outcomes

Forty documents produce 42 candidates because eight structured documents contain two invoices each. Thirty-four documents produce candidates. The six without candidates are four scan-designated PDFs, one unsupported non-invoice, and one malformed PDF. All eleven deliberately problematic documents are routed away from `PARSED` status.

The fixture PDF syntax is a safe synthetic native-text subset, not a claim of general PDF coverage. XLSX documents are genuine in-memory workbooks produced/read by ExcelJS. No raw fixture content is logged or persisted outside the corpus factory.
