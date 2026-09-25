# RecoverIA B2-C4B.0 — OAuth callback protocol correction

## Defect and protocol reality

The prior callback contract required `state`, `nonce`, and `code`. Google's OAuth 2.0 Web Server authorization-code flow returns the authorization `code` and the same opaque `state`; it does not return a separate application-generated nonce. Requiring that nonce made the real provider callback impossible to satisfy.

The corrected success contract is a GET to the exact configured callback path with exactly one `state` and exactly one `code`. A provider denial uses exactly one `state` and exactly one `error`. Unknown or duplicate parameters, the wrong method, and the wrong path fail closed. Callback values are not echoed in responses.

## State security model and nonce decision

RecoverIA generates one opaque 32-byte cryptographically random, base64url state handle. The durable store receives only its SHA-256 hash, together with the server-bound organization, operator, connection, callback URL, creation time, ten-minute expiry, schema version, and consumption time. The state contains no identity, credential, authorization code, token, or business data.

The separate external nonce was redundant: unpredictable state, hash-only lookup, durable server-side binding, expiry, and atomic one-time consumption already supply correlation, CSRF protection, and replay resistance for this pure OAuth flow. It was therefore removed from the authorization and callback protocols. The existing database column is retained as a compatibility-only internal column and receives the state hash; no schema migration is required and it is never accepted as callback input.

## Durable binding and consumption

The callback adapter accepts protocol fields only. Organization, operator, connection, and callback identity come from fixed server configuration plus the durable state record, never from query parameters, headers, cookies, or request bodies. The state hash is atomically changed from unconsumed to consumed only when it exists and has not expired. The bound record returned by that winning operation is checked against fixed runtime identity before any authorization-code exchange. Unknown, expired, consumed, replayed, cross-connection, or concurrently reused state cannot acquire exchange rights.

Provider error callbacks consume and validate state first, then return a sanitized denial. Provider and protocol failures do not echo raw state, codes, tokens, secrets, or provider bodies.

## Validation

Synthetic tests cover the real Google callback shape (`code` plus `state`), entropy and hash-only storage, durable binding, expiry, replay, concurrent consumption, differing codes against one state, malformed/random/cross-boundary state, duplicate parameters, method/path enforcement, identity-injection rejection, pre-exchange consumption, provider errors, and existing KMS, credential-vault, and lifecycle invariants. Deployment regression probes use synthetic invalid values only.

The corrected image was deployed to the existing isolated `recoveria-pilot-runtime` service as revision `recoveria-pilot-runtime-00009-2wz`, preserving its project, region, runtime service account, secret references, IAM, concurrency of one, and maximum instance count of one. The health endpoint remained `READY` with OAuth `NOT_READY` and Drive `DISABLED`. Synthetic invalid probes confirmed the provider-shaped `code` plus `state` callback reaches the guarded runtime, while missing, duplicate, unexpected, wrong-method, and wrong-path inputs fail with sanitized responses.

An explicitly authorized read-only verification of the established private synthetic-pilot database target found zero OAuth authorization states, zero credential envelopes, and zero lifecycle rows in `CONNECTED` state after the probes. No migration or schema change was applied.

## Explicitly not executed

This correction did not generate or open a real authorization URL, request consent, acquire or exchange an authorization code, acquire access or refresh tokens, enable Google Drive API, issue a Drive request, or execute B2-C4B. B2-C4B remains a separate founder-authorized gate because it introduces real provider authorization and credential effects that this protocol-only correction intentionally excludes.
