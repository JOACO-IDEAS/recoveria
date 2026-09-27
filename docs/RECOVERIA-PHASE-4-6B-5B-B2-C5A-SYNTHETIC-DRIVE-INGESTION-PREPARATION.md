# RecoverIA B2-C5A — Synthetic Google Drive ingestion preparation

## Status and boundary

C5A is prepared and validated offline. OAuth remains closed: the synthetic connection is `CONNECTED`, exactly one KMS-backed credential envelope exists, and its only recorded scope is `drive.readonly`. No credential was decrypted during C5A. Google Drive API remained disabled and Drive requests remained zero.

C5A did not create a Drive folder, upload, list, download, refresh an access token, execute the real pilot, deploy, or access Client Zero. The one-shot command remains fail-closed unless both the exact activation literal and exact operator confirmation are supplied.

## Deterministic corpus

`buildSyntheticDrivePilotCorpus` produces exactly 40 PDF files: 39 distinct byte payloads plus one exact-content duplicate under a distinct source identity. All content is visibly synthetic and marked `SIN VALOR FISCAL`. It contains five repeated synthetic customer identities, one repeated synthetic issuer, two numbering series, dates across six months, recurring services, varied nominal totals, and selected relationship cues. Identifiers use deliberately non-real synthetic values. No payment, outstanding-balance, collection, legal, or prescription status is asserted.

The materializer writes only to the ignored private boundary:

```text
.private/synthetic-pilot/c5a-drive-corpus/
  manifest.json
  invoices/
    40 synthetic PDFs
```

Files and manifest are mode `0600`; the directory is mode `0700`. The manifest contains only synthetic metadata and SHA-256 fingerprints. The private corpus is ignored and must never be committed.

## Future Drive layout and root binding

The C5B founder-created structure is:

```text
My Drive/
  Recoveria Synthetic Pilot/
    invoices/             <- configured root; PDFs directly inside
```

The configured root is the `invoices` folder, not My Drive and not its parent. The root ID does not yet exist and must not be invented. Shared Drive configuration is structurally rejected. Discovery now sends a parent-constrained query for direct children of the configured root rather than enumerating the whole user Drive. The client still re-fetches metadata and re-proves the file's current parent chain immediately before every download. A move, trash, ambiguous ancestry, Shared Drive identity, wrong organization/connection/root, non-PDF type, shortcut, or excessive size fails before content download. A redacted durable `STARTED` audit event is required before each download.

## Approved first-run limits

- expected corpus: 40 records
- anomaly/download ceiling: `min(50, ceil(40 × 1.25)) = 50`
- maximum PDF size: 25 MiB
- maximum listing pages: 10
- maximum attempts owned by the orchestrator: 3
- wall-clock deadline: 300,000 ms (5 minutes)
- concurrent provider operation: 1; the signal-binding transport rejects concurrent use

The one-shot operator command requires those exact values and rejects silent limit expansion. It accepts the database connection only through `RECOVERIA_PILOT_DATABASE_URL`, verifies the database name `recoveria_pilot`, lifecycle `CONNECTED`, exact stored scope metadata, concrete root ID, KMS/Secret Manager version bindings, fixed organization/connection, and exact operator confirmation before constructing the real run. Audit events are bound to the same durable execution ID. Output is aggregate and sanitized.

## Offline production-shaped rehearsal

The rehearsal uses the real client, root-membership logic, driver, orchestrator, incremental processor, deterministic understanding provider, checkpoint semantics, and an injected zero-network transport.

Run 1:

- discovered 40; understood 40; reused 0; failed 0
- invoices classified 40; exact duplicates 1
- identity clusters 5; unresolved identities 0
- relationship proposals 248; contradictions 0
- review-required aggregate 147; abstentions 7
- checkpoint version 1 committed only after complete processing

Run 2, unchanged:

- discovered 40; understood 0; reused 40; failed 0
- intelligence summary unchanged
- checkpoint version 2 committed

Incremental mutation rehearsal:

- one same-ID content change is re-understood
- a same-ID filename change remains the same source identity and is reused
- one new source ID with prior bytes is classified `SAME_CONTENT_DIFFERENT_SOURCE_RECORD`
- two absent prior IDs are classified `REMOVED` only after complete authoritative enumeration
- discovered 39; understood 2; reused 37; failed 0
- checkpoint version 3 committed

Audit, processing, timeout, root-membership, and checkpoint-CAS failures do not advance the previous trusted checkpoint.

## C5B milestone and prerequisites

C5B succeeds only when at least one PDF physically originating from the approved real synthetic My Drive root is discovered through Drive API, proven to be a current member of the configured root, downloaded read-only, parsed by the existing provider, represented with document/page provenance, included in corpus intelligence, and reflected in a durable successful checkpoint/result. A repository or local-file copy cannot satisfy this criterion.

Before any real Drive request, the founder must separately authorize C5B, then:

1. create the two-folder My Drive structure using only the approved synthetic/test Google account;
2. upload exactly the generated 40 PDFs directly into `invoices/` and nothing else;
3. provide the `invoices` folder ID through the established private configuration boundary;
4. authorize enabling Drive API and the existing runtime/job deployment needed to execute the one-shot command;
5. review the exact root, fixed bindings, limits, empty/expected checkpoint state, and operator confirmation immediately before execution.

Client Zero, real invoices, whole-Drive crawling, Shared Drives, Product Surface integration, and repeated OAuth remain prohibited.
