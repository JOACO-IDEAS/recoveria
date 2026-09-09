# RecoverIA Phase 2 Metrics

Measured offline against corpus v1 and its explicit manifest:

| Metric | Result |
|---|---:|
| Document classification | 40/40 (100%) |
| Parse success (documents yielding candidates) | 34/40 (85%) |
| Invoice number exact match | 42/42 (100%) |
| Amount exact match | 42/42 (100%) |
| Currency exact match | 42/42 (100%) |
| Invoice date exact match | 42/42 (100%) |
| Due date exact match, including expected null | 42/42 (100%) |
| CUIT exact match | 42/42 (100%) |
| Administration extraction | 42/42 (100%) |
| Building extraction | 42/42 (100%) |
| Expected duplicate type detected | 2/2 (100%) |
| Review recall for deliberately problematic documents | 11/11 (100%) |
| False entity confirmations | **0** |

The 85% parse rate is intentional and honest: four scanned PDFs are routed to the unavailable OCR boundary, one non-invoice is unsupported, and one malformed PDF fails without affecting its batch. Review recall counts review, unsupported, and failed statuses as correctly not accepted.

## Interpretation limits

These results measure a synthetic contract, not real-world accuracy. PDF fixtures use the adapter’s documented text subset; the administration catalog is small and deterministic; no OCR or probabilistic model runs. Before production claims, measure on a separately authorized representative sample and report precision/recall by layout, parser version, confidence state, and review burden. The acceptance priority remains zero false confirmations, even at the cost of more review.
