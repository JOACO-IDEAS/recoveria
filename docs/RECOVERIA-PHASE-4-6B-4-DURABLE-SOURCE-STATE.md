# RecoverIA Phase 4.6B.4 — Durable source state and Drive adapter contract

## Offline boundary

This phase defines local architecture only. It contains no Google SDK, OAuth flow, credentials, HTTP client, database persistence, production wiring, or network call. `GoogleDriveSourceContract` is a port and its conformance source is deterministic and in-memory.

## Durable checkpoint port

`SourceCheckpointStore` is vendor- and database-independent. Its local non-production implementation writes schema-versioned checkpoint JSON with deterministic key ordering and replaces the prior file through a same-directory atomic rename. Filenames are hashes of organization/source boundaries; no source label is exposed in a filename.

Every load validates:

- checkpoint schema version
- organization, source type, and source ID
- cursor boundary, when present
- entry processing version
- source provenance and source-document identity

Missing state is distinct from invalidated state. Corrupt, incompatible, or boundary-inconsistent state is never returned as trusted. Saves enforce the same boundary. Production database storage remains out of scope.

## Processing compatibility

Provider `id` identifies an implementation; `processingVersion` identifies its deterministic parser/normalization contract. Checkpoint reuse requires stable source identity, stable content fingerprint, a trusted prior outcome, and an exact processing-version match. A processing-version change emits `PROCESSING_VERSION_CHANGED` and re-runs understanding while preserving extraction provenance produced by the new parse.

## Cursor semantics

`SourceCursor` is opaque and bound to organization, source type, and source ID. A source may expose only full `discover()`, or may additionally expose `discoverChanges()` and `currentCursor()`.

For this offline safety phase, full deterministic discovery remains authoritative on every run. Change sets and cursors are advisory: they can establish continuity and prepare future optimization, but cannot create, remove, or alter documentary truth alone. Invalid, expired, malformed, wrong-boundary, or failed cursor reads fall back to a fresh source-bound cursor when one is safely available, otherwise the checkpoint records no cursor. Cursor failure never discards a successful full-discovery result and no stale cursor is presented as fresh. Removals continue to be calculated explicitly from the authoritative enumeration. Prior checkpoint cursor boundary mismatches fail before source access.

The authorized local corpus evaluator loads and saves through `LocalFileSourceCheckpointStore` under the ignored Client Zero checkpoint boundary. Its first run creates durable state; subsequent unchanged runs reuse trusted parses. Missing or corrupt state safely starts a full processing run. Source PDFs are read-only.

## Drive adapter contract

A future adapter must provide stable Drive file IDs, current names and locators, MIME type, byte size, modified time, deterministic pages, content bytes, source provenance, classified retryable/non-retryable errors, and optional cursor/change-set support. Drive file ID—not name, path, or SHA-256—is `sourceDocumentId`.

The deterministic fake proves rename, move, byte changes, unchanged reuse, removal, identical bytes under distinct IDs, deterministic pagination, retryable fetch recovery, expired-cursor fallback, tenant/source isolation, and processing-version invalidation.

## Scale evidence

A 520-document Drive-like corpus uses 13 deterministic pages, repeated customer identities, contradictory identity evidence, missing tax identifiers, and an unchanged second run. The test proves:

- initial understanding: 520 documents
- unchanged second-run understanding: 0 documents
- unchanged second-run reuse: 520 documents
- exhaustive possible pairs: 134,940
- strong-key candidate pairs: 3,120 (97.69% reduction)
- strong-key blocked and exhaustive relationship reports: exact equality
- serialized/reloaded checkpoint result: exact equality with uninterrupted in-memory execution

This is architectural evidence, not a production capacity guarantee.

## Known limitations

- Full enumeration remains mandatory; cursor-only delta execution is intentionally not trusted yet.
- The local file store is for tests and authorized non-production workflows only.
- There is no Google API implementation, credential lifecycle, rate-limit policy, or production retry scheduler.
- Memory remains proportional to the discovered corpus and bytes read during a run.
- Accounting state, current balance, payment state, collectability, and legal state remain separate evidence domains and are never inferred here.
