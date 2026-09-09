# RecoverIA Phase 3 Metrics

Measured offline on 20 difficult identity cases:

| Metric | Result |
|---|---:|
| Candidate recall (cases with named expected candidate) | 15/15 (100%) |
| Auto-resolution precision | 4/4 (100%) |
| Auto-resolution recall among identity-present cases | 4/16 (25%) |
| Exact result/review routing | 20/20 (100%) |
| Strong-conflict detection | 3/3 (100%) |
| Confirmed-alias memory reuse | 2/2 tested paths (100%) |
| Rejection-memory compliance | 2/2 tested paths (100%) |
| False auto-resolutions | **0** |
| False cross-tenant resolutions | **0** |

Low automatic recall is intentional. Only exact tenant CUIT and non-contradicted human-confirmed alias memory auto-resolve. Names, contacts, and temporal building relationships remain review evidence.

The corpus covers formatted CUIT, abbreviation/punctuation, different/conflicting CUIT, multiple and changing building relationships, missing CUIT, similar trade names, confirmed/rejected aliases, ambiguity, no-match, cross-tenant lookalike, contact overlap, human decisions, correction/supersession, and incomplete evidence. These synthetic results are policy-contract measurements, not real-data performance claims.
