# RecoverIA Phase 4.6B.5A — Offline Google Drive source

## Boundary

This phase is entirely offline. It contains no Google SDK, HTTP transport, OAuth flow, credential, token storage, Google Cloud configuration, production persistence, scheduler, UI, or network call. The supplied Drive folder was not accessed.

## Architecture

`GoogleDriveClientPort` owns the narrow vendor operation set: root-bound file pages, metadata, PDF bytes, initial change token, and paginated changes. `GoogleDriveSource` owns mapping those responses into RecoverIA's source-independent contracts. `FakeGoogleDriveClient` implements the same port deterministically for conformance and end-to-end testing.

A future `DriveConnection` binds one organization and connection to a Google subject, one explicitly authorized root, an optional shared-drive ID, and authorization state. Credential material is deliberately absent and remains a separate future boundary. Drive cursors carry a generic deterministic boundary namespace derived from authorized root plus optional shared-drive ID. It does not expose those identifiers, and it prevents a token from being reinterpreted under another corpus on the same connection. Legacy cursors without the namespace fail closed.

## Documentary identity and supported content

Google Drive `fileId` is `sourceDocumentId`. Names, parent-derived locators, size, MIME type, and modified timestamps remain mutable source metadata. Same names and same bytes never collapse distinct Drive IDs. Rename and move preserve identity.

Only `application/pdf` file records are read from the client. Google-native Docs, Sheets, Slides, shortcuts, folders, and other MIME types are not fetched or followed; they enter the explicit unsupported model. A shortcut cannot widen the authorized corpus boundary.

## Discovery and changes

Full discovery consumes every page, validates every record against the authorized root, deduplicates pagination by stable file ID, sorts deterministically, omits folders and trashed records, and fails the discovery rather than presenting a partial page set as complete. Full and change pagination reject repeated or cyclical page tokens and enforce a 10,000-page maximum. These failures never publish accumulated partial pages as a complete corpus.

Change tokens remain opaque. Change pages preserve explicit removed/trashed IDs, active changed records, and a new start token. Invalid or expired tokens return safe fallback statuses. The incremental processor continues treating full discovery as authoritative. Cursor acquisition cannot discard a successful full run, and a new cursor is checkpointed only when processing completes without failures.

## Root-membership contract for the future real client

`corpusRootId` is a security assertion made by the future real client and independently checked by `GoogleDriveSource`. The client may set it only after proving membership from Drive IDs and parent relationships obtained from Drive metadata—not from a filename, display path, or string prefix.

- A direct child qualifies when its authoritative parent ID is the selected root.
- A nested descendant qualifies only after walking authoritative parent IDs to the selected root, with cycle detection and a bounded traversal. Immediate-parent equality is not required.
- A file moved into the root becomes eligible only after the new parent chain is proven.
- A file moved out is absent from full discovery and appears as an explicit removal through reconciliation/change handling.
- Current Drive semantics normally expose a single parent, but the proof must safely handle zero, duplicate, or unexpectedly multiple parents: every accepted ancestry must terminate at the authorized root; ambiguity fails closed.
- My Drive traversal must not cross into unrelated roots merely because a human-readable path looks similar.
- Future shared-drive traversal must bind and verify both the shared-drive ID and root; a root from another drive fails closed.
- Trashed files are not active corpus members and must be emitted as removal evidence where change data permits.
- Shortcuts are records, not ancestry edges, and their targets are never followed.
- Permission loss prevents proof and becomes an authorization failure, not evidence of a complete empty corpus.
- Missing or inconsistent parent metadata, inaccessible ancestors, cycles, or conflicting drive/root identifiers mean membership is unproven and must fail closed.

The client should cache only tenant/source-bound ancestry proofs with explicit invalidation on relevant changes. A locator may be derived after membership proof for display/provenance, but never establishes membership or identity.

## Future metadata fast-path specification—not implemented

Current authoritative cost is exactly one content read per supported active PDF per full discovery run. Accordingly, 100, 500, and 1,000 unchanged supported PDFs require 100, 500, and 1,000 reads today. No cost estimate may assume otherwise.

A later, separately reviewed optimization may treat stable remote metadata as a hint to defer immediate byte verification for a previously trusted checkpoint entry. Candidate signals are stable file ID, modified time, size, and a provider-supported content checksum or immutable content-version field. Metadata is not documentary truth:

- new records always fetch bytes;
- any metadata change, absence, inconsistency, unsupported checksum, or processing-version change fetches bytes;
- a byte fetch recomputes SHA-256, which remains ultimate content identity;
- metadata hints never merge distinct file IDs;
- skipped verification must be explicit in metrics/provenance, never reported as byte-verified;
- periodic and operator-triggered authoritative byte-verification sweeps remain available;
- change tokens alone cannot justify skipping verification;
- any ambiguity falls back to fetching bytes.

## Error taxonomy

- retryable: rate/quota 403, 429, timeout/interruption, and 5xx
- authorization state: 401, revoked consent, and permission loss
- terminal/input: invalid ID, malformed request, unsupported MIME, and corpus-boundary violations
- cursor: invalid and expired tokens

The source performs no hidden or infinite retries. It exposes sanitized codes and retryability to a future scheduler.

## Product-safe reporting

`SanitizedDriveCorpusReport` exposes only aggregate processing status, discovered/new/changed/reused/unsupported/failed counts, invoices understood, review-required count, and contradictions. It contains no filenames, locators, contents, Google subject, or tokens.

## Offline evidence

The end-to-end tests execute the real deterministic understanding, normalization, duplicate, identity, relationship, and checkpoint pipeline through `GoogleDriveSource`. The 510-record scale corpus contains repeated identities and deliberate tax-ID contradictions:

- exhaustive pairs: 129,795
- strong-key blocked pairs: 2,640
- reduction: 97.97%
- blocked and exhaustive relationship reports: exact equality
- unchanged second run: 0 understood, 510 reused
- churn run: 509 active/discovered, 2 understood, 507 reused, 1 content-changed, 1 new, 2 removed (delete + trash), 1 locator-only move, 0 failed

## Known limitations

- There is no real Drive client, OAuth, token vault, scheduler, production checkpoint repository, or UI.
- Full authoritative runs currently read each active PDF to verify its content fingerprint; unsupported records are never fetched. Future byte-fetch optimization requires a separately reviewed trustworthy content-version signal and reconciliation policy.
- Shared-drive identifiers are modeled but real shared-drive behavior is not enabled.
- Paths are presentation metadata only; the future client must derive them without treating them as identity.
