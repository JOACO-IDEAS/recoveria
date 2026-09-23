# RecoverIA Phase 4.6B.5B-B2-C4A — OAuth configuration

## Purpose and posture

B2-C4A configured the Google OAuth application boundary for the isolated `synthetic-pilot` environment without initiating authorization or acquiring a token. The Google Auth Platform application remains External and in Testing status. It is not published or submitted for verification, and it has exactly one founder-controlled test user.

## OAuth client

- Project: `recoveria-pilot`
- Client name: `Recoveria Synthetic Pilot`
- Client type: Web application
- Client ID: `27126432407-945995r3f070v7nd05dprfm44b8dqtqr.apps.googleusercontent.com`
- Authorized redirect URI: `https://recoveria-pilot-runtime-72qfitymsq-rj.a.run.app/oauth/google/callback`
- Authorized JavaScript origins: none
- Alternate redirect URIs: none

Provider inventory was reduced to this single active OAuth client. Automation-created and superseded clients were deleted.

## Secret architecture and remediation

An earlier client secret was treated as compromised after visual exposure. The compromised client/credential and an automation-created duplicate were deleted. Final provider metadata showed one retained client with one enabled replacement secret and no active compromised secret.

The replacement value was accepted only after its masked provider suffix matched the mode-`0600` ignored pending file. It was written directly to version 1 of `projects/recoveria-pilot/secrets/google-oauth-client-secret` without displaying plaintext. The temporary file was deleted immediately after ingestion. Runtime access remains `roles/secretmanager.secretAccessor` on that exact secret only.

No secret value appears in source, Git, documentation, inventory, Cloud Run plain environment configuration, or deployment logs.

## Runtime configuration and readiness

Cloud Run service `recoveria-pilot-runtime` revision `recoveria-pilot-runtime-00008-mcd` receives the client ID and exact numbered Secret Manager reference as server-side non-secret identifiers. The existing database secret, runtime identity, region, scaling limits, callback route, and IAM boundaries were preserved.

The runtime deliberately keeps `activationEnabled=false`, uses the fail-closed unconfigured OAuth provider adapter, and retains no Drive root. Therefore the actual health vocabulary remains:

```json
{"status":"READY","oauth":"NOT_READY","drive":"DISABLED"}
```

This means provider configuration exists but authorization is not enabled. The system is not `CONNECTED`, cannot initiate authorization, and cannot exchange codes in C4A.

## State, nonce, and callback security

The existing durable callback architecture hashes state and nonce, binds them to fixed server-side organization/operator/connection/callback identity, enforces expiry and single consumption, and rejects invalid or duplicate protocol parameters. C4A did not issue valid state or nonce values.

Deployed regression probes confirmed missing parameters, duplicate parameters, invalid state, wrong methods, and unknown routes fail closed with sanitized, no-store responses. Final durable counts were 0 OAuth states, 0 credential envelopes, and 0 connected lifecycle rows.

## Drive invariant

Google Drive API remains disabled. No Drive root exists, no Drive authorization occurred, and Drive requests remain zero. Merely declaring the future `drive.readonly` scope does not activate the API or grant access.

## What does not exist

- OAuth authorization request or consent event
- Authorization code, access token, or refresh token
- Refresh-token ciphertext or credential envelope
- Connected lifecycle state
- Drive API enablement, root, file access, or request
- Public/published OAuth application
- Client Zero access or production authorization

## Teardown and revocation additions

1. Disable/delete Secret Manager version 1, then delete the OAuth secret container when no longer required.
2. Delete the retained OAuth Web client from Google Auth Platform.
3. Remove the sole test user and OAuth application configuration if the pilot is abandoned.
4. Remove the client ID and secret reference from Cloud Run and deploy a fail-closed revision.
5. Preserve sanitized deletion evidence; never export secret plaintext.

## Next gate

B2-C4B requires separate founder authorization. Before the first OAuth token, wire and adversarially review the real Secret Manager, OAuth HTTP, and KMS adapters; enable authorization only through an operator-controlled state issuance path; preserve exact callback and fixed identity; and validate revocation and audit behavior.

Before the first synthetic Drive request, separately authorize Drive API enablement, create and bind a synthetic-only root, and approve one-shot execution. Client Zero remains NO-GO pending explicit residency, security, and founder review.
