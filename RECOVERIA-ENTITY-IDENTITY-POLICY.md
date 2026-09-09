# RecoverIA Entity Identity Policy

## Automatic resolution

Only two deterministic paths qualify:

1. Exactly one entity in the authorized tenant/type has the normalized 11-digit CUIT, with no candidate carrying name/alias support contradicted by a different CUIT.
2. Exactly one active human-confirmed exact normalized alias points to the entity, with no active rejection or contradictory CUIT.

Everything else requires review or remains unresolved. Exact/similar name, building, email, domain, phone, contact, and trade name never auto-resolve alone. A strong contradiction takes precedence over an otherwise exact identifier and returns `CONFLICT`.

## Normalization

Normalization removes case, accents, punctuation, repeated spaces, legal-form punctuation, and conservatively expands `ADM` to `ADMINISTRACION`. It does not reorder words or remove meaningful tokens. Thus `GARCIA ADMINISTRACIONES` does not automatically collapse into `ADMINISTRACION GARCIA SRL`.

## Tenant and liability boundaries

CUIT uniqueness remains tenant-scoped, matching the Phase 1 schema audit. Candidate generation filters tenant first. Administration, Building, billed party, and contact are separate operational concepts; resolution never declares the legally liable debtor.

## Proposal contract

Every result includes source references, candidate IDs, supporting evidence, contradictions, reason codes, resolved ID or null, and whether human action is required. Precision is prioritized over auto-resolution recall.
