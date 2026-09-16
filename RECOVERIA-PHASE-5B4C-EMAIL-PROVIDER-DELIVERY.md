# RecoverIA Phase 5B.4C — Email Provider and Delivery Boundary

## Architecture

Phase 5B.4C preserves the 5B.4B execution sequence: trusted current-state loading, same-call send revalidation, durable safety version/fingerprint comparison, serializable execution claim, immutable attempt creation, and only then a provider crossing. The public execution input still cannot supply current state, recipient, provider request identity, or authorization.

Provider-specific code is isolated in `email-provider`. Core execution supplies a provider-neutral request containing the existing SHA-256 request key and the exact approved content. The email destination is reconstructed from the trusted current `ContactPoint` selected by the approved draft. Its channel ID and normalized value must equal the approved facts before a claim is created. The adapter cannot select a recipient, channel, contact, invoice, amount, subject, body, or legal language.

Resend is the first real-provider-capable candidate because its API is narrow and supports an idempotency header plus signed delivery webhooks. RecoverIA uses a small HTTP interface instead of adding a provider SDK. The production-capable fetch implementation exists behind the adapter, while every test injects a deterministic client or exercises a gate before HTTP. No request was sent in this phase.

## Acceptance and execution outcomes

`ACCEPTED` means only that the provider returned a positive acknowledgement containing a real provider message identifier. It does not mean delivered, opened, read, answered, paid, or recovered. A successful HTTP response without the bounded identifier is `UNKNOWN`; RecoverIA never fabricates an identifier.

`FAILED` is limited to a local failure before transmission or an explicit provider rejection that establishes non-acceptance. Timeout, connection loss, server error, malformed success, or any exception after transmission may have begun is `UNKNOWN`. `UNKNOWN` remains reconciliation-required and is never automatically retried. Replays of ACCEPTED or UNKNOWN executions remain duplicate requests and do not cross the provider again.

The existing SHA-256 `providerRequestKey` remains stable for tenant plus draft. It excludes approval, attempt, process, and time. The Resend adapter forwards it as the HTTP idempotency key and as a correlation header. A new draft receives a new key.

## Runtime and recipient safety

The real adapter fails closed unless all of these are simultaneously present:

- `RECOVERIA_REAL_PROVIDER_SEND_ENABLED=true`;
- provider credential and configured sender;
- exact normalized recipient membership in `RECOVERIA_EMAIL_RECIPIENT_ALLOWLIST`.

Defaults are disabled sending and an empty allowlist. No address or secret is hardcoded. Configuration is server-side only; no `NEXT_PUBLIC_*` value is read. The adapter rechecks authorized recipient equality and channel identity immediately before its HTTP client can run. Missing enablement, credentials, sender, allowlisting, or recipient/channel equality is a definite pre-transmission failure. It produces no network call.

## Delivery observations and webhook authenticity

Acceptance and delivery are separate persisted facts. `CommunicationDeliveryEvent` is append-only and supports only `DELIVERED`, `BOUNCED`, and `DELIVERY_UNKNOWN`. It records tenant, execution, attempt, provider, provider message ID, provider event ID, event time, bounded evidence code, and SHA-256 payload hash. It stores neither raw webhook payload nor headers.

The Resend webhook boundary verifies a Standard Webhooks-style HMAC over the exact raw body, provider event ID, and timestamp before parsing. Missing, invalid, wrong-secret, or tampered signatures are rejected. Tests require no real secret. The provider event identity is unique per tenant/provider: identical replay is idempotent, while the same identity with contradictory content is rejected.

Correlation starts with a trusted tenant routing context and the durable provider message identity on the accepted execution outcome. PostgreSQL uniquely constrains provider message identity per tenant. Provider ID must also equal the attempt provider. Unknown message IDs, wrong tenants, non-accepted outcomes, and provider mismatches are rejected; no event is attached by textual guess.

Contradictory delivery observations remain separate immutable events. The bounded projection returns `DELIVERY_UNKNOWN` with review required instead of overwriting history. A confirmed bounce is evidence and a review signal only; it does not silently invalidate a contact point.

## Financial truth boundary

Delivery persistence has no API for receivables, balances, promises, disputes, recommendations, or case state. `DELIVERED` and `BOUNCED` cannot reduce a balance, mark payment, fulfill a promise, resolve a dispute, close a case, or claim recovery. Inbound email, mailbox synchronization, response interpretation, promise extraction, and dispute extraction remain out of scope.

## PostgreSQL validation

Both additive 5B.4C migrations are applied only to the explicitly allowlisted isolated RecoverIA disposable PostgreSQL target. Live tests use `PrismaCommunicationExecutionStore` and `PrismaCommunicationDeliveryStore`; no production database is used. The database validates serializable execution claim behavior, immutable outcome truth, accepted message identity, signed delivery ingestion, identical replay, contradictory history preservation, cross-tenant rejection, and concurrent replay convergence. Suite cleanup deletes only its synthetic organizations and cascade-owned rows.

## Remaining races and future gates

A database transaction cannot include the external provider. A process may still lose an acknowledgement after transmission, so UNKNOWN investigation and provider-side reconciliation remain mandatory. Webhook ordering is not assumed. Every safety-critical state writer must still advance the durable execution safety row transactionally.

A future real-send smoke test requires a separate explicit human authorization, one founder-controlled allowlisted address, server-side provider configuration, reviewed sender identity, and observation of provider acceptance plus delivery reconciliation. This phase does not authorize that test.

5B.4D or 5B.5 may add provider-side lookup/reconciliation, explicit operator retry policy, safe bounce review workflows, and later inbound-email processing. They must not collapse provider acceptance into delivery or mutate financial truth from communication events. WhatsApp, SMS, phone, scheduling, cadence, campaigns, autonomous sending, AI reply interpretation, payment plans, and legal workflows remain deferred.
