# RecoverIA Phase 5B.4B — Durable Communication Execution Boundary

## Architecture and persistence decision

An in-memory lock cannot protect communication execution across processes, restarts, workers, or crashes. The production boundary therefore uses PostgreSQL through `PrismaCommunicationExecutionStore`. The test-only `InMemoryCommunicationExecutionStore` exercises the same contract deterministically but is explicitly not production durability.

The additive migration creates `CommunicationExecution`, `CommunicationSendAttempt`, and `CommunicationSendOutcome` plus bounded provider-neutral enums. It was generated for review and validated against the Prisma datamodel, but it was not applied to any production, Client Zero, or other external database.

The existing Prisma collection vocabulary predates the approved domain vocabulary and includes legacy values such as `CollectionEventType.MESSAGE_SENT`. Removing or rewriting those historical structures would be destructive and is outside this phase. The new execution tables are the canonical persistence path for communication execution: legacy collection events must not represent provider acceptance, failure, or uncertainty. The persisted execution captures draft ID and content hash (not message body), human approval ID/actor, tenant/case/contact/channel/intent, included invoice IDs, target amount in cents, evidence references, revalidation fingerprint/time, claim time, provider-neutral status, and stable request identity.

## Lifecycle and unique execution identity

The persisted lifecycle is `READY → ATTEMPTING → ACCEPTED | FAILED | UNKNOWN`. `READY` exists only inside the claim transaction. `ATTEMPTING` means the immutable attempt was persisted before the provider boundary; it does not mean the provider accepted anything.

PostgreSQL enforces one logical execution per `(organizationId, draftId)`. It also uniquely constrains tenant/idempotency key, tenant/provider request key, `(executionId, attemptNumber)`, and one outcome per attempt. Composite tenant/case, tenant/execution, and tenant/attempt foreign keys prevent cross-tenant relational linkage at the database layer. Multiple approvals of one draft therefore converge on one execution. A new draft gets a new execution and provider request key.

## Immediate revalidation and claim concurrency

`executeCommunicationBoundary()` accepts the underlying draft, request, explicit HUMAN approval, current communication state, explicit times, store, and provider boundary. It calls `revalidateCommunicationForSend()` immediately before claim creation and never accepts a caller-supplied authorization. Failed or stale revalidation returns `BLOCKED_BEFORE_ATTEMPT`; it writes no provider-bound attempt and never invokes the provider.

The Prisma claim runs in a serializable transaction. It upserts by the tenant/draft unique key, then performs a compare-and-set update from `READY` to `ATTEMPTING`; only the transaction whose update count is one creates attempt 1. Serialization conflicts are retried up to three times. Duplicate or concurrent requests observe the existing execution and cannot cross the provider boundary again. The application-level test adapter serializes its claim method only to verify this contract; the PostgreSQL constraint and transaction are the production guarantee.

Current communication facts are domain inputs rather than rows read by this adapter, so the revalidation read and execution claim cannot yet share one database snapshot. Revalidation is placed immediately before the claim, which minimizes but does not eliminate that race. A future production integration must load persisted current facts in the same strongest-practical transaction and still cannot make a database transaction atomic with an external provider.

## Attempt and outcome semantics

An attempt is append-only and created before provider invocation. It records execution, attempt number, provider-neutral optional provider ID, stable provider request key, start time, current fingerprint, and evidence. No update method exists for attempts.

Outcome is a separate immutable one-per-attempt record:

- `ACCEPTED`: the provider positively acknowledged acceptance. It is not delivery confirmation.
- `FAILED`: RecoverIA knows the provider did not accept the request, including a classified pre-transmission failure.
- `UNKNOWN`: acceptance cannot be determined—for example timeout after possible transmission, connection loss, unexpected provider error, or crash after attempt creation.

An UNKNOWN outcome is never converted to FAILED, SENT, or ACCEPTED and is never automatically retried. Repeating an accepted, unknown, failed, or currently attempting execution returns the existing logical execution without creating another attempt. `FAILED` is classified as manually retry-eligible for a future explicit policy; `UNKNOWN` and `ATTEMPTING` require reconciliation; `ACCEPTED` is never retryable. Phase 5B.4B implements no retry operation.

`recoverInterruptedCommunicationExecution()` converts a persisted `ATTEMPTING` execution with no completed outcome to immutable `UNKNOWN` / `PROCESS_INTERRUPTED_AFTER_ATTEMPT_CREATION`. It never assumes that a crash means provider rejection.

## Provider boundary and idempotency

`CommunicationExecutionProvider` is a provider-neutral seam used only with deterministic synthetic test doubles in this phase. There is no real implementation, network call, credential, SMTP, email API, Meta, Twilio, Resend, or WhatsApp integration.

The provider request key is derived from tenant and draft identity and is stable for the same logical execution, including any future safe retry. It differs for a new draft and does not contain attempt number or approval ID. Future 5B.4C adapters must forward this key wherever the provider supports idempotency.

The known external-side-effect race remains: state may change after revalidation or the process may lose the provider response. Phase 5B.4C must revalidate with persisted current state as close as possible to invocation, use execution serialization, pass the stable provider key, classify transmission-aware errors, and reconcile UNKNOWN outcomes before any retry.

## Security and testing boundary

Durable records contain IDs, fingerprints, evidence references, invoice scope, amount, and a non-reversible local content hash; message subject/body are not persisted or logged by this module. Tests use synthetic contacts and deterministic provider doubles only.

No authorized local PostgreSQL fixture database is configured in this repository. The Prisma schema, generated client, validation, migration SQL, serializable transaction/CAS implementation, and uniqueness definitions were verified offline. Contract concurrency is exercised against the deterministic test adapter, but live PostgreSQL contention behavior remains unexecuted and must be integration-tested against an isolated non-production PostgreSQL database before provider enablement.

## Remaining deferrals

Resolved here: Prisma execution vocabulary, write-time HUMAN approval gate at the execution boundary, durable draft-scoped idempotency, durable database claim concurrency, append-only attempts, immutable outcomes, and crash/UNKNOWN semantics.

Still deferred are applying the migration, isolated PostgreSQL integration/load tests, persisted-current-state transactional reads, provider implementation and provider-specific delivery semantics, UNKNOWN reconciliation, explicit manual retry execution, webhook processing, inbox synchronization, scheduling, cadence, AI drafting, fingerprint canonicalization/cryptographic migration, case-wide fingerprint audit clarity, natural-language amount/date validation, contact-name validation outside greetings, minimum fact/evidence references, and per-invoice payment allocation.
