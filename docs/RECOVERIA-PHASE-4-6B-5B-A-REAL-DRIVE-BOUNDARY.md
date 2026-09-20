# RecoverIA Phase 4.6B.5B-A — Real Drive client boundary, inactive

## Safety state

The production-shaped client exists only behind injected credential and transport ports. There is no HTTP transport implementation, OAuth flow, credential, secret storage, Google configuration, network execution, production database, scheduler, or public route. The operator command intentionally returns `GOOGLE_DRIVE_PILOT_NOT_CONFIGURED`.

## Official API assumptions verified

- Google recommends the narrowest scope. `drive.file` provides per-file access to files opened with or shared with the app through a picker; `drive.readonly` can view and download all Drive files and is restricted: [Choose Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
- `files.list` returns paginated metadata and requires explicitly selected fields; `files.get` returns metadata and `alt=media` returns blob content: [Search for files and folders](https://developers.google.com/workspace/drive/api/guides/search-files), [files resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/files).
- A file has one parent in current Drive semantics; names are not unique; `trashed` can reflect direct or ancestor trash: [files resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/files).
- Change tracking starts with `changes.getStartPageToken`, paginates through `changes.list`, and advances with `newStartPageToken`: [Retrieve changes](https://developers.google.com/workspace/drive/api/guides/manage-changes).
- `401` represents invalid/expired authorization; `403` meaning depends on the Google reason; `404` can mean nonexistent or inaccessible; `429` and server failures require retry policy: [Resolve Drive errors](https://developers.google.com/workspace/drive/api/guides/handle-errors), [Drive limits](https://developers.google.com/workspace/drive/api/guides/limits).
- Shared-drive operations require all-drives support and, where applicable, drive ID and inclusion parameters: [Shared-drive support](https://developers.google.com/workspace/drive/api/guides/enable-shareddrives).

## Scope finding

The official `drive.file` description establishes per-file authorization; it does not establish that selecting a folder confers recursive, durable access to every existing descendant and every future file later added beneath it. Therefore the required continuous-folder product semantics cannot safely be assumed under `drive.file`.

Founder decision is required between:

1. A narrower Picker/per-file pilot using `drive.file`, which changes the product requirement and does not promise automatic future-folder discovery.
2. The intended continuous-folder pilot using read-only Drive access, expected to require restricted `drive.readonly` and its verification/security obligations.

No scope has been selected or activated.

## Client and transport

`RealGoogleDriveClient` implements the existing read-only port. Its injected `GoogleDriveTransport` supports only `FILES_LIST`, `FILES_GET`, `FILES_DOWNLOAD`, `CHANGES_START_TOKEN`, and `CHANGES_LIST`. There are no create, upload, update, rename, move, trash, delete, or permission operations. `DriveCredentialProvider` supplies a future valid access token by connection ID; the client knows nothing about OAuth callbacks or token persistence.

The transport receives semantic operations and validated parameters rather than owning corpus logic. Tests provide deterministic responses and failures. No Google SDK dependency was added because the current port needs five read operations and an injectable narrow transport is materially smaller than the broad SDK. A future audited HTTP implementation may use REST directly or justify the official library.

## Root membership

Membership is proven from authoritative IDs and parent metadata with a 128-level maximum, cycle detection, and per-discovery memoization. Direct and nested descendants are accepted; moved-out files are excluded. Missing/inaccessible parents, conflicting parents, ancestry cycles, shared-drive mismatches, and malformed metadata fail closed. Trashed files or ancestors are inactive. Paths and names do not participate in proof. Shortcuts are never ancestry edges.

## Download safety

Before every `alt=media` request, the client discards all cached target and ancestor metadata plus all cached membership decisions, fetches fresh target metadata, and re-traverses fresh authoritative ancestry to the selected root. It then verifies active authorization, `application/pdf`, declared size, and a configurable response ceiling. The default pilot ceiling is 25 MiB.

`maximumResponseBytes` is a mandatory transport-time constraint. A future transport must enforce it while streaming through a bounded reader, Range requests where appropriate, or an early abort. Buffering an arbitrary complete response and checking afterward is prohibited. The client's post-download byte-length check remains defense in depth only. Oversized files emit `DRIVE_DOCUMENT_TOO_LARGE` and are not processed.

## `drive.readonly` defense in depth

Google authorization and RecoverIA corpus authorization are different boundaries. If restricted `drive.readonly` is approved, Google technically permits reads across the account's accessible Drive, while RecoverIA must continue allowing content only beneath its selected `authorizedRootId`.

The pilot must therefore require fresh root-membership proof before every PDF download, a security audit event for each actual content download, anomaly detection when download counts materially exceed expected corpus size, periodic validation of the granted OAuth scope where technically available, no filename/content in ordinary telemetry, no shortcut following, and the existing read-only transport surface.

## Failure and state model

Connection states are `DISCONNECTED`, `AUTHORIZATION_PENDING`, `CONNECTED`, `REAUTHORIZATION_REQUIRED`, and `REVOKED`; legacy offline `AUTHORIZED` remains temporarily accepted. Authorization failure never means empty Drive and never deletes trusted evidence.

Google status plus reason metadata maps to retryable, authorization, terminal, invalid-cursor, or expired-cursor outcomes. No retry happens inside the client. The future execution layer owns bounded exponential backoff.

## Persistence and telemetry

`ProductionSourceCheckpointPort` defines tenant/connection-bound load and atomic save with optimistic version checks. The implementation supplied here is deterministic and in-memory only; no migration or database connection exists.

Operational telemetry is allowlisted to operation, outcome, duration, count, and error category. Access/refresh tokens, authorization headers, OAuth codes, filenames, Drive/root IDs, Google subjects, bytes, and invoice fields are structurally excluded.

## Synthetic pilot corpus for 4.6B.5B-B

Create exactly 40 active synthetic records in a dedicated test account and one selected root:

- 37 PDFs across root and three nested folders, including one file above 25 MiB
- within those PDFs: two same-name/different-ID pairs, two exact-byte/different-ID copies, two rename targets, two internal-move targets, two content-replacement targets, one copy target, one delete target, and one trash target
- 1 Google-native document (unsupported)
- 1 shortcut whose target is outside the root (never followed)
- 1 plain-text unsupported file

Use a small page size in the pilot transport configuration to force pagination. Separately exercise temporary permission loss, consent revocation, invalid/expired change token, retryable rate limit, and restoration. All content must be synthetic; no Client Zero or personal Drive data is permitted.

## Remaining activation work

Founder approval is required for the scope, dedicated test account, Google Cloud project, consent-screen ownership, exact callback origin, encrypted credential store, synthetic folder/root, 25 MiB ceiling, pilot operator, and cleanup/revocation procedure. Only after security audit may an HTTP transport, OAuth callback, encryption-backed credential provider, and isolated persistent checkpoint store be implemented and exercised.
