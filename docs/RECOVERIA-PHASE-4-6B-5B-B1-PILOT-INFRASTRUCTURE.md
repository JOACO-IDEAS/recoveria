# RecoverIA Phase 4.6B.5B-B1 — Controlled Drive pilot infrastructure

## Inactive safety state

All infrastructure is built but inactive. The pilot kill switch is immutable `false`, the connection is `DISCONNECTED`, the credential provider always returns `GOOGLE_DRIVE_PILOT_NOT_CONFIGURED`, no OAuth endpoint is exposed, and there is no scheduler or public route. No real credential or Drive request exists.

## Concrete read-only transport

`BoundedGoogleDriveHttpTransport` maps only the five allowlisted read operations to the official Drive v3 REST paths. Its fetch function is injected; no global/network fetch is invoked during tests. The official API documents stored-file downloads through `files.get` with `alt=media`, while Google-native files require export and therefore remain unsupported: [files.get](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/get).

PDF responses are consumed incrementally. The reader aborts and cancels as soon as adding a chunk would exceed `maximumResponseBytes`; partial bytes are never returned. JSON/error responses also have a 2 MiB ceiling. The 25 MiB pilot default remains configurable and the downstream length check remains defense in depth.

## OAuth boundary

The server-side boundary is configured for the exact restricted scope `https://www.googleapis.com/auth/drive.readonly`, one exact callback URL, offline access, and explicit consent. State and nonce are independent 256-bit random values. Pending state expires after ten minutes and binds organization, operator, connection, and callback. Validation rejects replay, expiry, wrong nonce, wrong organization/operator/connection/callback, missing required scope, and any unexpected additional scope. Root selection remains a later explicit action and is not derived from OAuth.

Google requires exact redirect URI matching and recommends state for CSRF protection: [OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server). The code builds and validates request material only; it does not open a consent page or exchange a code.

## Credential boundary

`EncryptedRefreshCredentialVault` depends on an authenticated-encryption/KMS port with organization and connection as authenticated context. Refresh credentials never enter checkpoints, provenance, or telemetry. The deterministic provider exists in tests only. No production key or encryption provider is configured. Access credentials remain memory-only through `DriveCredentialProvider`; the configured provider is disabled.

## Authorized root and persistence

`LocalPilotConnectionStore` atomically persists only organization, connection, Google subject, authorized root ID, explicit authorization state, and sanitized scope state. Filenames and paths are never authority. `LocalPersistentPilotCheckpointStore` provides isolated filesystem persistence with tenant/connection binding, optimistic locking, atomic rename, and easy cleanup. It does not use production or Client Zero databases.

## Security audit and anomaly controls

Every actual `FILES_DOWNLOAD` transport invocation is wrapped by `AuditedGoogleDriveTransport`. Audit records contain organization, connection, SHA-256 opaque document reference, timestamp, passed root-proof state, and started/succeeded/failed outcome. They exclude filename, bytes, invoice values, and credentials.

The deterministic monitor stops before download when either the absolute hard limit or `ceil(expectedCorpusSize × maximumExpansionRatio)` would be exceeded. Repeated boundary failures have a separate configured maximum. For the 40-record pilot, deployment configuration must set explicit values and cannot infer them from live Drive.

## Retry and revocation

External retries are bounded by attempts, truncated exponential backoff, deterministic injectable jitter, and valid `Retry-After`. Authorization and terminal failures never retry. Google recommends truncated exponential backoff for quota/rate errors: [Drive usage limits](https://developers.google.com/workspace/drive/api/guides/limits).

Revocation and permission loss transition connection state to `REVOKED` or `REAUTHORIZATION_REQUIRED`; trusted checkpoints remain intact. Google documents that revocation invalidates scopes/tokens for the project: [OAuth token revocation](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke).

## Synthetic configuration

Exactly one configuration is defined: organization `synthetic-pilot`, connection `synthetic-drive-pilot`, expected records 40, PDF ceiling 25 MiB, required `drive.readonly` scope, state `DISCONNECTED`, kill switch disabled. Corpus contents follow the committed 40-record B-A specification.

## Remaining activation boundary

Activation still requires founder approval, a dedicated Cloud project/account/folder, consent configuration, exact callback, real managed encryption keys, a credential exchange/refresh implementation, persisted audit sink, pilot limits, and an explicit one-time execution authorization. None is present here.
