# RecoverIA Phase 4.6B.5B-B2-A — controlled activation infrastructure

## Status and boundary

B2-A builds the bridge but does not cross it. There is no route, scheduler, environment wiring, real secret, global network transport, consent launch, OAuth exchange, token acquisition, or Drive request. The existing operator command remains bound to the immutable disabled B1 gate.

Configuration, authorization, credential storage, token acquisition, and Drive execution remain separate operations. `inspectPilotActivation` is read-only and returns `NOT_READY` unless every dependency, binding, and limit is explicit. External booleans accept only the exact lowercase strings `true` or `false`; malformed values are rejected.

`inspectPilotActivation` is advisory infrastructure in B2-A because no real integration route or orchestrator exists. The next integration phase has a non-negotiable runtime invariant: **no real callback, token acquisition, or Drive execution unless immediately preceded by `inspectPilotActivation(...).status === "READY"`**. B2-A does not claim global enforcement before that integration layer exists.

## OAuth lifecycle

`GoogleDriveOAuthBoundary` remains the sole authorization-request/state boundary. It constructs but never opens an authorization URL with one exact callback, `response_type=code`, `access_type=offline`, explicit consent, cryptographic state and nonce, and only `drive.readonly`. `GoogleDriveCallbackService` consumes and validates state before invoking the injected exchange port, then validates the provider-returned scope, encrypts and persists the refresh credential, and only afterward transitions the connection to `CONNECTED`.

OAuth errors, missing codes, replay, expiry, binding mismatch, exchange failure, scope mismatch, missing refresh credentials, encryption failure, and persistence failure never produce `CONNECTED`. State is single-use; after a process restart, the current in-memory B1 state store rejects the callback and the operator must begin a new authorization. This is safe and fail-closed for offline single-process testing but is **not suitable for a deployed callback**. Before deployment, a durable shared OAuth-state store is mandatory with single use, expiry, organization/operator/connection/nonce/exact-callback binding, atomic consume, multi-instance safety, and restart safety. Provider authorization codes are assumed single-use and are never stored or logged.

Google documents the web-server authorization-code flow, exact redirect behavior, offline access and refresh requests at [Using OAuth 2.0 for Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server). It documents `invalid_grant` for invalidated refresh credentials and notes that refresh tokens can be revoked or expire at [Using OAuth 2.0 to Access Google APIs](https://developers.google.com/identity/protocols/oauth2). Revocation can invalidate the project grant, so it is modeled as an explicit operator action rather than a retry side effect.

## Credential and encryption lifecycle

`GoogleOAuthClientPort` exposes only exchange, refresh, and explicit revoke. Its default implementation fails closed. `RefreshingDriveCredentialProvider` verifies the authoritative lifecycle is `CONNECTED` before returning cached credentials, decrypting refresh credentials, refreshing, and returning a newly refreshed credential. It coalesces concurrent refreshes, keeps access credentials in memory, respects expiry with a safety window, and transitions `invalid_grant` toward `REAUTHORIZATION_REQUIRED`.

`ManagedKmsEncryptionAdapter` is a production-shaped adapter over a managed provider. It requires an explicit key ID and version and binds organization and connection as authenticated context. It contains no cryptographic implementation or key material. Decryption, wrong-context, corruption, and missing configuration fail closed.

`CredentialEnvelopeRepository` persists only an encrypted envelope, key reference/version, exact granted scopes, provider subject, lifecycle timestamps, and optimistic revision. Plaintext refresh credentials, access credentials, authorization codes, and headers are excluded. The included repository is isolated and deterministic for tests; selection of a durable production repository and managed KMS remains a founder infrastructure decision.

## Audit and execution boundary

`DurableDownloadSecurityAuditSink` adapts B1 security events to an append-only repository with an execution identifier, content-download event type, read-only operation, opaque document reference, timestamp, root proof and outcome. It contains no filename, content, raw metadata, or credential. Audit failure propagates and therefore fails closed before a B1 monitored content download can continue.

Google classifies `drive.readonly` as a restricted scope that can view and download all Drive files. RecoverIA therefore retains its independent authorized-root proof and synthetic corpus boundary; OAuth permission never establishes application corpus authority. See [Choose Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

## Activation contract and limits

Required configuration includes the activation flag, client identifier, secret reference (never the secret value), exact HTTPS callback, exact scope, organization, connection, authorized root, managed encryption, credential repository, OAuth provider, append-only audit repository, checkpoint repository, and explicit limits. Conservative ceilings are: expected corpus `1,000`, hard downloads `2,000`, expansion ratio `10`, PDF bytes `104,857,600` (100 MiB), pages `1,000`, retries `10`, and execution duration `3,600,000 ms` (one hour). Scientific notation, unsafe integers, non-finite values, overflow products, and values above a ceiling are rejected rather than clamped.

The intended synthetic values remain approximately 40 records and a 25 MiB PDF ceiling. They are not active defaults: the runtime parser requires the operator to supply them explicitly. These fields are configuration/preflight controls only in B2-A. Before the first synthetic Drive request, the B2-B execution orchestrator must enforce every field at runtime: expected-corpus anomaly ceiling, hard downloads, expansion ratio, PDF bytes, pages, retries, and execution duration. No field may remain schema-only.

## Lifecycle and remaining decisions

Authorization URL creation does not connect an account. Callback receipt and code presence do not connect an account. Only validated state, successful exchange, exact returned scope, encrypted refresh-credential persistence, and a valid lifecycle transition produce `CONNECTED`. Revocation and `invalid_grant` preserve trusted corpus evidence and require reauthorization.

Before Google configuration, the founder must select an isolated Cloud project/account/folder, consent posture, exact callback, managed KMS/key, durable credential repository, durable append-only audit repository, and checkpoint location. Before a first token, those adapters must be implemented and independently audited, durable/restart-safe OAuth state must be selected, real secret references must be provisioned, and explicit authorization must be given. Before a first synthetic Drive request, limits and anomaly thresholds must be approved and runtime-enforced, the synthetic root must be bound, the operator-only one-time execution control must be enabled, and an audited dry preflight must be `READY`. Full revoke orchestration—provider revocation, local credential destruction, lifecycle transition, and defined partial-failure semantics—remains deferred and is mandatory before Client Zero, though not before the first synthetic smoke.

The B1 deterministic temporary-file concurrency race remains deferred because B2-A does not select or activate that local persistence path for concurrent/multi-process operation. The other deferred B1 findings remain unchanged.
