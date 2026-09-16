# RecoverIA Phase 5B.4B — Durable Communication Execution Boundary

## Architecture and persistence decision

An in-memory lock cannot protect communication execution across processes, restarts, workers, or crashes. The production boundary therefore uses PostgreSQL through `PrismaCommunicationExecutionStore`. The test-only `InMemoryCommunicationExecutionStore` exercises the same contract deterministically but is explicitly not production durability.

The additive migration creates `CommunicationExecution`, `CommunicationSendAttempt`, and `CommunicationSendOutcome` plus bounded provider-neutral enums. It was generated for review and validated against the Prisma datamodel, but it was not applied to any production, Client Zero, or other external database.

The existing Prisma collection vocabulary predates the approved domain vocabulary and includes legacy values such as `CollectionEventType.MESSAGE_SENT`. Removing or rewriting those historical structures would be destructive and is outside this phase. The new execution tables are the canonical persistence path for communication execution: legacy collection events must not represent provider acceptance, failure, or uncertainty. The persisted execution captures draft ID and content hash (not message body), human approval ID/actor, tenant/case/contact/channel/intent, included invoice IDs, target amount in cents, evidence references, revalidation fingerprint/time, claim time, provider-neutral status, and stable request identity.

## Lifecycle and unique execution identity

The persisted lifecycle is `READY → ATTEMPTING → ACCEPTED | FAILED | UNKNOWN`. `READY` exists only inside the claim transaction. `ATTEMPTING` means the immutable attempt was persisted before the provider boundary; it does not mean the provider accepted anything.

PostgreSQL enforces one logical execution per `(organizationId, draftId)`. It also uniquely constrains tenant/idempotency key, tenant/provider request key, `(executionId, attemptNumber)`, and one outcome per attempt. Composite tenant/case, tenant/execution, and tenant/attempt foreign keys prevent cross-tenant relational linkage at the database layer. Multiple approvals of one draft therefore converge on one execution. A new draft gets a new execution and provider request key.

## Immediate revalidation and claim concurrency

Phase 5B.4B.1 closes the caller-supplied-state gap. `CommunicationExecutionService` is constructed with an internal `CommunicationExecutionStateLoader`, durable store, and provider boundary. Its public `execute()` request accepts the underlying identities/domain records and request time, but neither `current` state nor a loader. The trusted loader returns an `ExecutionSafetySnapshot` containing current communication input, explicit `asOf`, durable monotonic version, and safety fingerprint. The service verifies tenant/case scope, internal times, and that the fingerprint actually matches the loaded state before calling `revalidateCommunicationForSend()`.

The claim transaction reads `CommunicationExecutionSafetyState` and accepts the claim only when both its durable version and fingerprint equal the snapshot that was revalidated. A changed or missing row returns `SAFETY_STATE_CHANGED`, persists no execution/attempt, and invokes no provider. This is state-based optimistic concurrency, not an arbitrary freshness TTL.

The Prisma claim runs in a serializable transaction. After the safety-version predicate passes, it upserts by the tenant/draft unique key, then performs a compare-and-set update from `READY` to `ATTEMPTING`; only the transaction whose update count is one creates attempt 1. Serialization conflicts are retried up to three times. Duplicate or concurrent requests observe the existing execution and cannot cross the provider boundary again. The application-level test adapter serializes its claim method only to verify this contract; the PostgreSQL constraint and transaction are the production guarantee.

The remaining race is explicit: a state writer that fails to advance the safety row could evade the CAS. Every future persisted safety-critical mutation must therefore update this row transactionally with its own write. A database transaction still cannot be atomic with an external provider.

## Current-state source audit

The current communication input is assembled in domain code and synthetic fixtures; it is not reconstructable completely from the current Prisma schema. Invoice/receivable balances and case links have persistence vocabulary, but there is no approved loader bridging those rows to the current projections. Promise persistence is legacy and does not represent the full derived promise/allocation model. Current payment claims and disputes are not represented by canonical Prisma models. Contact/contact-point rows exist but lack the approved eligibility, relationship-status, channel-status, and supersession vocabulary. Recommendation, entity ambiguity, legal review, policy toggles, and evidence state are either derived, only partially persisted, or not persisted in the current communication shape.

Accordingly, 5B.4B.1 does not claim full production transactional freshness. It adds the enforceable durable invalidation/CAS boundary and removes caller injection, but no production `CommunicationExecutionStateLoader` is provided until canonical persistence and mutation hooks can populate and advance safety state truthfully.

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

The provider request key now uses Node SHA-256 over tenant and draft identity. It is stable for the same logical execution, including any future safe retry, differs for a new draft, needs no secret, and contains neither attempt number nor approval ID. Draft content audit hashing also uses SHA-256. Future provider adapters must forward the request key wherever provider idempotency is supported.

The known external-side-effect race remains: state may change after revalidation or the process may lose the provider response. Phase 5B.4C must revalidate with persisted current state as close as possible to invocation, use execution serialization, pass the stable provider key, classify transmission-aware errors, and reconcile UNKNOWN outcomes before any retry.

## Security and testing boundary

Durable records contain IDs, fingerprints, evidence references, invoice scope, amount, and a non-reversible local content hash; message subject/body are not persisted or logged by this module. Tests use synthetic contacts and deterministic provider doubles only.

No authorized RecoverIA PostgreSQL fixture database is configured. The integration harness reads only `RECOVERIA_TEST_DATABASE_URL`, requires `RECOVERIA_TEST_DATABASE_ALLOWLIST=recoveria-disposable-test`, and requires a database name visibly containing both RecoverIA and test/disposable semantics. It never falls back to `DATABASE_URL`. Without those proofs it skips; a configured unsafe target fails closed. The harness covers concurrent first claim/upsert, one attempt, safety-version rejection, conflicting outcome uniqueness, and transaction rollback atomicity. Live results remain blocked until an allowlisted disposable database is supplied and both migrations are applied there.

## Interrupted-attempt reconciliation runbook

`reconcileInterruptedCommunicationExecutions()` makes recovery operationally reachable without inventing an orphan timeout. It accepts unique operator-selected execution IDs only and transitions still-ATTEMPTING/no-outcome records to UNKNOWN with `PROCESS_INTERRUPTED_AFTER_ATTEMPT_CREATION`.

Manual procedure: do not retry the provider call; identify the orphaned execution explicitly; run reconciliation; verify UNKNOWN; investigate the provider using the stable provider request key; only then allow a later human/policy decision. Reconciliation never infers ACCEPTED or FAILED.

`CollectionEventType.MESSAGE_SENT` remains legacy-only. This boundary never emits it and it must not encode attempted, ACCEPTED, FAILED, UNKNOWN, or delivered state.

## Remaining deferrals

Resolved here: caller-state injection, trusted-loader contract, durable safety version/fingerprint CAS, explicit interrupted-attempt reconciliation, and SHA-256 provider identity, in addition to the existing execution vocabulary, HUMAN approval gate, durable draft idempotency, claim concurrency, append-only attempts, immutable outcomes, and UNKNOWN semantics.

Still deferred are applying both execution migrations to an isolated test database, running live PostgreSQL integration/contention tests, canonical persistence and mutation hooks for every safety fact, a production trusted loader, provider implementation and provider-specific delivery semantics, provider-side UNKNOWN investigation, explicit manual retry execution, webhook processing, inbox synchronization, scheduling, cadence, AI drafting, case-wide fingerprint audit clarity, natural-language amount/date validation, contact-name validation outside greetings, minimum fact/evidence references, and per-invoice payment allocation.
