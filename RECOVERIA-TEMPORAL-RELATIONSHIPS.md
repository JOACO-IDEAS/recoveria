# RecoverIA Temporal Relationships

`AdministrationBuilding` already records `validFrom`, `validTo`, confirmation, and evidence. Resolution evaluates the relationship at the invoice date, not today.

Corpus example: Administration García manages Building X through 2024-12-31; Administration Sur manages it from 2025-01-01. A 2024 invoice proposes García, while a 2026 invoice proposes Sur. Neither relationship auto-confirms identity or legal liability. García can simultaneously manage Building Y, proving the one-administration/many-buildings shape.

Required invariants before database use: inclusive non-overlapping periods for confirmed relationships, tenant equality across administration/building/evidence, `validTo >= validFrom`, append/supersede corrections, and explicit treatment of unknown dates. An invoice without a reliable date cannot use temporal relationship evidence automatically.

Contacts are separately time-aware associations. Shared email/phone/domain values can support review but cannot uniquely identify an entity or transfer a historical invoice when management changes.
