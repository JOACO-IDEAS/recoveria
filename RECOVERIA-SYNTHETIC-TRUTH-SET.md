# RecoverIA Synthetic Truth Set

## Dataset

The deterministic fixture at `src/test/fixtures/synthetic-truth-set.ts` uses only invented names and `example.invalid` contacts. Its fixed as-of time is **2026-09-01 00:00:00 UTC**.

- 1 tenant: Ascensores Horizonte S.A. (synthetic)
- 1 synthetic issuer plus 6 administration Parties
- 12 buildings (two per administration)
- 4 contacts attached to administrations 1–4; administrations 5–6 intentionally lack contacts
- 30 ARS invoices
- 34 ledger entries: 30 issuance entries and 4 payments
- 12 collection cases
- 3 unresolved entity observations
- 1 open promise and 1 missed promise

No record derives from Christophersen Ascensores or any real person/company record.

## Expected portfolio output

All amounts below are ARS, derived from integer-cent ledger state as of the fixed time.

| Measure | Expected |
|---|---:|
| Total invoiced | 8,830,000 |
| Total outstanding | 8,300,000 |
| Total overdue | 8,100,000 |
| Current outstanding | 200,000 |
| 1–30 | 280,000 |
| 31–60 | 840,000 |
| 61–90 | 1,075,000 |
| 91–180 | 1,985,000 |
| 181–365 | 2,420,000 |
| 365+ | 1,500,000 |

Largest administration: `adm4`, ARS 2,440,000. Largest building: `b07`, ARS 1,440,000. Oldest outstanding invoice: `i09`, ARS 800,000 and 2,435 days overdue.

## Scenario truth table

| Scenario | Fixture | Expected outcome |
|---|---|---|
| Paid normally | `i01` | Invoice ARS 100,000; derived outstanding 0 |
| Not yet due | `i02` | ARS 200,000 in CURRENT; excluded from overdue total |
| Recently overdue | `i03` | 12 days overdue; bucket 1–30 |
| 30–60 days | `i04` | 48 days overdue; bucket 31–60 |
| 90+ days | `i06` | 153 days overdue; bucket 91–180 |
| Very old | `i09` | 2,435 days overdue; creates review eligibility only |
| Partial payment | `i10` | ARS 500,000 issued minus ARS 200,000 payment = ARS 300,000 |
| Multiple unpaid | buildings `b01`–`b08` | Aggregated by administration/building without liability inference |
| Missing administration | `i15` | Pending entity-resolution evidence, no confirmed administration |
| Missing contact | cases `b09`–`b12` | Returned by missing-contact query |
| Ambiguous entity | `i17` | Two candidate administration IDs; remains pending |
| Inconsistent raw naming | `i18` | Raw `SUR ADMINISTRACIONES` retained beside normalized candidate |
| Promise recorded | case `b05` | OPEN promise, not broken |
| Missed promise | case `b06` | Returned by broken-promise query |
| Disputed invoice | `i11` | DISPUTED but ARS 250,000 remains in ledger until evidenced adjustment |
| No response | case `b07` | Immutable synthetic `NO_RESPONSE` event |

## Data-quality outputs

- Missing contacts: `case-b09`, `case-b10`, `case-b11`, `case-b12`.
- Entity review: `case-b09`, `case-b11`, `case-b12`.
- Broken promises: `case-b06`.
- Configured legal-review threshold: `i09` only.

Tests assert these exact outcomes, not snapshots generated from the implementation.
