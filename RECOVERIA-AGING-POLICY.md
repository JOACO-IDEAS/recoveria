# RecoverIA Aging Policy

## Default policy

The policy is a versioned value in `src/lib/domain/aging.ts`, passed into calculation functions rather than scattered as constants.

| Bucket | Inclusive days overdue |
|---|---:|
| CURRENT | ≤ 0 |
| 1–30 | 1–30 |
| 31–60 | 31–60 |
| 61–90 | 61–90 |
| 91–180 | 91–180 |
| 181–365 | 181–365 |
| 365+ | ≥ 366 |

`daysOverdue = floor((asOfUTC - dueAtUTC) / 24 hours)`. A due date equal to `asOf` is CURRENT. Aging includes only the derived outstanding amount; fully settled invoices contribute zero. Overdue total includes positive outstanding balances with `daysOverdue > 0`.

## Configuration contract

An `AgingPolicy` has key, version, ordered non-overlapping bucket definitions, and a separate `legalReviewAfterDays`. Before policies are editable, validation must prove complete coverage, no overlap, stable versioning, and tenant authorization. Calculations retain the as-of timestamp and policy version.

The synthetic default legal-review threshold is 1,095 days solely to exercise workflow. It is not a limitation, prescription, enforceability, or jurisdictional rule. Meeting it makes a record eligible for a human/legal review flag only.

## Currency and time boundaries

No FX conversion occurs; distributions remain per currency. Production date semantics must distinguish date-only invoice terms from timestamps. The Phase 1 truth set uses midnight UTC deliberately so daylight-saving/local-time behavior cannot change expectations.
