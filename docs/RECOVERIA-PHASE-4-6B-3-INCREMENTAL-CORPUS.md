# RecoverIA Phase 4.6B.3 — Incremental corpus intelligence

## Source identity and content identity

RecoverIA models two independent identities:

- `sourceDocumentId` identifies a record in a source system. A Drive adapter would use the stable Drive file ID, not its filename or folder path.
- `fingerprintSha256` identifies the observed bytes. It changes when content changes and remains stable when identical bytes move or are copied.

`locator`, `displayName`, timestamps, MIME type, and size are source metadata. They do not establish documentary truth. A stable source record can move without changing content; a stable locator can expose changed bytes; two source records can expose identical bytes.

## Checkpoint model

`SourceCheckpoint` is a pure, source-independent representation of the last observed corpus revision. It contains the tenant/source boundary and one entry per retained source record:

- source metadata and provenance
- content fingerprint
- trusted `DocumentParseResult`
- processing outcome and provider version
- deterministic last-observed corpus revision

There is no production persistence in this phase. Callers may keep the checkpoint in memory or serialize it inside an authorized boundary. A checkpoint from another tenant, source type, or source ID is rejected.

## Change classification

- `NEW`: source record was not present and content was not previously observed.
- `UNCHANGED`: source identity, locator, bytes, and trusted provider version remain compatible.
- `CONTENT_CHANGED`: stable source identity now exposes different bytes.
- `PROCESSING_VERSION_CHANGED`: bytes are unchanged, but the explicit parser/normalization contract changed and the document is reprocessed.
- `LOCATOR_CHANGED`: stable source identity and bytes remain the same while its locator changes.
- `SAME_CONTENT_DIFFERENT_SOURCE_RECORD`: a new source identity contains bytes already observed elsewhere. It remains a distinct record and is re-understood to preserve correct document identifiers.
- `REMOVED`: a prior source identity is no longer discovered.
- `FETCH_FAILED_RETRYABLE`: discovery found the record but content could not be read.

Filename equality is never used as content identity.

## Incremental reuse rules

`CorpusProcessor.processIncremental()` delegates to the incremental runner while preserving the existing provider and downstream engines.

An entry is reused only when source identity and SHA-256 fingerprint match, the provider's explicit deterministic `processingVersion` matches, and the prior outcome was successful, review-required, or unsupported. Provider identity and processing compatibility are deliberately separate. Metadata-only movement does not invalidate documentary observations. New, content-changed, copied, previously failed, or processing-version-changed records are processed again.

Reused results retain their original observations, page/region coordinates, extraction method, parser version, raw values, normalized values, and confidence. Removed records leave the active corpus. A transient fetch failure retains the last trusted checkpoint entry for retry but appears as an explicit failure; it is never reported as fresh success.

## Failure taxonomy

- `DISCOVERY_FAILURE`: source enumeration failed; retryable.
- `CONTENT_FETCH_FAILURE`: one discovered record could not supply bytes; retryable.
- `UNDERSTANDING_FAILURE`: decoding/provider processing failed; retryability is explicit.
- `UNSUPPORTED`: successful determination that the input is unsupported; not an error.
- `UNKNOWN_DOCUMENT`: processing succeeded but semantic type is not known; not an error.
- `partialSuccess`: successful documents coexist with one or more failures.

Discovery failure preserves the prior checkpoint instead of inventing an empty successful corpus.

## Strong-key relationship blocking

Candidate generation indexes only signals already used by the relationship engine:

- normalized customer tax identifier
- normalized customer address
- normalized customer name, solely to preserve hard tax-ID contradiction detection

Name remains non-authoritative and never becomes merge evidence. Documents lacking every safe key abstain from pair generation because the existing engine cannot establish a relationship for such pairs. Tests compare blocked and exhaustive outputs to ensure no existing proposal, contradiction, or unmatched signal is lost.

## Scale validation

A deterministic paged fake remote source processed 600 synthetic PDFs:

- discovered: 600
- understood on initial run: 600
- reused on unchanged second run: 600
- re-understood on second run: 0
- possible exhaustive pairs: 179,700
- candidate pairs after strong-key blocking: 0 for the deliberately unrelated unique-identity corpus
- provider document count across both runs: 600, proving no redundant understanding

The focused suite, including all incremental scenarios and the 600-document run, completed in under one second on the validation machine. This is architectural evidence, not a production capacity guarantee.

## Drive-like contract validation

The fake remote source simulates stable remote IDs, paged enumeration, creation, movement/rename, content mutation, removal, copied bytes under another ID, fetch failure, provider failure, discovery failure, and retry. This proves a future `GoogleDriveSource` needs only to implement `DocumentSource` accurately.

A future Drive adapter must provide:

- stable Drive file ID as `sourceDocumentId`
- current parent/name locator as metadata
- MIME type, size, and modified timestamp when available
- paginated deterministic enumeration
- byte access with classified retryable failures
- source provenance

OAuth, Drive SDK/API calls, credentials, change tokens, and network retry policy remain future work.

## Accounting boundary

Incremental document processing does not infer payment state, current balance, allocation, collectability, or legal status. Catedral evidence remains a later, separate accounting source describing events after invoice issuance.

## Known limitations

- Checkpoints are not durably persisted.
- A same-content copy with a new source identity is reprocessed rather than rebasing old observation identifiers.
- Local-folder identity is derived from tenant/source/relative locator, so a local rename appears as a removed record plus same-content new record; Drive can express `LOCATOR_CHANGED` because its file ID is stable.
- Strong-key blocking deliberately abstains when no safe candidate key exists.
- Memory use remains proportional to active corpus results and source bytes during one run.
