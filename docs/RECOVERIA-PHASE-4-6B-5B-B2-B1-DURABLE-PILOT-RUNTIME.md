# RecoverIA Phase 4.6B.5B-B2-B1 — durable pilot runtime

## Status

B2-B1 implements production-shaped runtime code and additive schema only. It does not configure Google Cloud, connect PostgreSQL/Neon, apply migrations, deploy Cloud Run, initiate OAuth, retrieve secrets, call KMS, or call Drive. Every provider and network boundary is injected; the current operator command remains disabled.

## Architecture and trust boundaries

The runtime separates strict activation configuration, durable OAuth state, callback orchestration, Secret Manager, KMS, encrypted credential persistence, lifecycle, OAuth HTTP, Drive execution, security audit, checkpoints, and execution-run state. Real callback and execution boundaries require `inspectPilotActivation(...).status === "READY"`; callback additionally requires `AUTHORIZATION_PENDING` or `REAUTHORIZATION_REQUIRED`, while execution requires `CONNECTED`.

Google authorization remains different from RecoverIA corpus authorization. Every execution is bound to one organization, connection, and configured root. Driver-returned root metadata cannot override that root.

## PostgreSQL persistence and migration

The additive Prisma migration creates tenant-scoped models for OAuth states, connection lifecycle, encrypted credential envelopes, append-only audit events, source checkpoints, and pilot executions. OAuth consumption uses one conditional `UPDATE` over unconsumed, unexpired, fully bound state, so concurrent callbacks have one winner across processes. Credential and checkpoint writes use revision comparison. A partial unique PostgreSQL index permits at most one `PENDING` or `RUNNING` execution per organization/connection.

No application update/delete method exists for security audit events. A `STARTED` event without a terminal partner remains identifiable after interruption. The migration contains no `DROP`, `TRUNCATE`, data rewrite, or destructive alteration and is not applied by this phase.

## Callback and partial failures

The framework-neutral Cloud Run contract accepts only GET on an exact path and returns fixed no-store JSON without echoing code, state, nonce, token, provider details, or stack traces. Core callback processing performs mandatory readiness and lifecycle checks, atomically consumes durable state, exchanges once, validates exact scope, encrypts/persists the refresh credential, then transitions lifecycle to `CONNECTED`.

Google exchange is external and cannot share a transaction with RecoverIA. If exchange succeeds but later persistence fails, the consumed state plus pending lifecycle makes the failure detectable and prevents token use. If credential persistence succeeds but lifecycle persistence fails, the encrypted envelope can be recovered or destroyed operationally, while B2-A lifecycle gating keeps it unusable. Retrying requires a new OAuth state/code; authorization codes are treated as single-use.

## Cloud adapters

`GoogleSecretManagerAdapter` accepts only explicit project/secret/version resource references. Secret values remain memory-only and provider failures become `SECRET_MANAGER_UNAVAILABLE`.

`GoogleCloudKmsManagedEncryptionProvider` accepts one configured SOFTWARE-key version resource and passes canonical organization/connection authenticated context. Key material never enters RecoverIA. Raw provider errors are replaced with fixed encryption/decryption errors, and envelope rows retain key ID/version for rotation.

`GoogleOAuthHttpAdapter` uses only fixed Google token and revocation HTTPS endpoints, form POST, bounded 64 KiB response parsing, an abort timeout, validated response shapes, and sanitized error classes. `expires_in` must be a positive integer no greater than 86,400 seconds (24 hours); invalid values are rejected rather than clamped. Scope validation remains in the service layer. No production fetch is supplied here.

## Execution runtime

The one-shot orchestrator requires explicit operator confirmation, enabled/READY configuration, `CONNECTED` lifecycle, exact organization/connection/root bindings, durable checkpoint availability, append-only audit, and an exclusive durable execution run.

Every configured limit is active: expected-corpus expansion and hard downloads produce a finite anomaly ceiling; PDF metadata and streamed response bytes obey `maximumPdfBytes`; page loops obey `maximumPages`; external operations obey `maximumRetryAttempts`; an independent wall-clock timer races every awaited driver operation and aborts at `maximumExecutionDurationMs`. This makes the orchestration deadline hard even when a driver ignores `AbortSignal`; late resolution/rejection cannot change terminal run state. Providers must still honor the signal to release their own network resources promptly. A final deadline check occurs before `SUCCEEDED`.

Only failures classified retryable by the existing Drive normalization are retried. Authorization, permission, root, validation, and security failures receive one attempt. Exactly one layer may own retries for a concrete operation: the first real driver must expose raw single-attempt calls when the orchestrator owns retries, or explicitly disable orchestrator retries when the driver/transport owns them. Silent N×N retry multiplication is prohibited.

Timeout records `ABORTED`, stops future work, does not synthesize removals, and does not replace trusted checkpoints. Durable checkpoint persistence and CAS exist, but this orchestrator currently gates only on repository availability and does not call `save()`. Safe advancement must be wired at an unambiguous corpus-processing commit point with the real driver and independently audited before the first synthetic Drive request.

Audit `STARTED` is durable before content download. Audit failure prevents the download. A downstream interruption can leave a dangling `STARTED`, which is intentional forensic evidence rather than fabricated success.

## Remaining activation boundary

Founder actions before configuration: create the isolated RecoverIA Google Cloud project, approve the exact `drive.readonly` consent posture, Cloud Run callback URL, Secret Manager reference, SOFTWARE KMS key/version, isolated Neon database, synthetic account, and synthetic root.

Before callback deployment: independently audit this work, apply the additive migration only to the isolated RecoverIA database, configure real adapters, provision Cloud Run identity/IAM, and verify runtime preflight in the deployed environment. `createCloudRunCallbackHandler` is only a framework-neutral contract; no real route exists. Real wiring must close over server-side fixed organization, operator, and connection identifiers. Those bindings must never come from callback query parameters.

Before the first OAuth token: explicitly authorize the one-time flow after callback, state persistence, KMS, secret, credential, audit, checkpoint, and lifecycle probes pass.

Before the first synthetic Drive request: seed the approximately 40-record PDF-only corpus, approve all limits, verify the execution lock and timeout telemetry, and issue a separate explicit one-shot operator authorization.

Provider revoke → local credential destruction → lifecycle `REVOKED` remains deliberately unimplemented with partial-failure semantics required before Client Zero. Client Zero remains NO-GO. ConcilIA and production data are outside this architecture.

## Manual stale-run recovery for the synthetic pilot

The one-shot runtime intentionally has no lease/heartbeat yet. If a process crashes after writing `RUNNING`, an authorized operator must identify the stale execution, confirm no Cloud Run/process instance and no Drive request remains active, record a sanitized recovery reason, and transition that same row to `ABORTED` through an explicitly reviewed controlled database/application operation. The row must never be deleted and its audit trail remains intact. No new run may start until recovery completes. Because no controlled recovery method is implemented in B2-B1, the pilot is blocked after a stale lock until that reviewed operation is available. Lease/heartbeat/reclaim is mandatory before Client Zero or scheduling.
