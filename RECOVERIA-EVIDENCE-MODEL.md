# RecoverIA Evidence Model

## Three separate layers

1. **Raw source fact:** `SourceDocument` custody metadata and `ExtractedField.rawValue` plus source coordinates. It records what was observed, not what is true.
2. **Normalized interpretation:** `ExtractedField.normalizedValue` and ranked `EntityResolutionEvidence` candidates with method, confidence, features, and rank.
3. **Human-confirmed fact:** append-only `EntityResolutionDecision` naming actor, time, rationale, and selected evidence. A later correction creates a decision that `supersedes` the prior decision.

For `ADM. GARCIA SRL`, the raw spelling remains intact; `ADMINISTRACION GARCIA SRL` can be a normalized candidate; only a decision may point to a Party. Invoice links must not be treated as confirmed when the decision remains pending.

## Immutability contract

Source documents, extraction runs/fields, resolution evidence/decisions, ledger entries, and collection events are historical records. Corrections append and may supersede; they never overwrite source observations. Phase 1 pure fixtures are recursively frozen, and correction tests prove the earlier history remains unchanged.

Prisma uses restrictive deletion for evidence and transactional idempotency keys. True database-enforced append-only privileges/triggers are intentionally deferred until an actual PostgreSQL environment is authorized; they are mandatory before real-data ingestion.

## Traceability

Financial entries and collection events require `evidenceRef`. Resolution candidates link to one extracted field. A legal-review flag records all evidence references plus policy key/version, threshold, observed days, and as-of time. Future recommendations may reference only these addressable facts.

## Uncertainty rules

- Confidence is metadata, not confirmation.
- Zero candidates is an explicit `NO_MATCH`/review path.
- Multiple plausible candidates remain pending.
- Deterministic identifier matches still retain method/features and may require review under policy.
- No source evidence is deleted when a normalized value or entity changes.
