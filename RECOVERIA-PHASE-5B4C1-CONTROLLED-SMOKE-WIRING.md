# RecoverIA Phase 5B.4C.1 — Controlled Self-Email Smoke-Test Wiring

## Why this wiring exists

Phase 5B.4C established sound execution, Resend, and delivery-reconciliation modules but intentionally provided no runnable path joining them. This phase adds one operator-only CLI. It is not an HTTP route, browser feature, startup hook, build step, migration, cron, scheduler, or deployment action.

The entry point is `npm run smoke:email:controlled`. It accepts no arguments or stdin recipient. Any CLI argument is rejected. It calls the existing `CommunicationExecutionService`, which alone crosses the existing `CommunicationExecutionProvider` boundary. Real mode instantiates the existing `ResendEmailProvider`; the script never calls Resend or an HTTP client directly.

## Fixed synthetic truth and recipient provenance

All tenant, case, administration, building, invoice, contact, channel, relationship, request, draft, approval, and preparation identities are deterministic constants containing `recoveria-controlled-smoke-test`. Identity override environment variables are rejected. Existing rows with the same organization or case ID but incompatible values cause failure rather than reuse.

The subject is `[RECOVERIA TEST] Prueba controlada de comunicación`. The body states that it is an internal test and does not represent a debt, invoice, claim, or real collection communication. It contains no amount, invoice reference, demand, legal language, or real organization data.

For a future real run, `RECOVERIA_SMOKE_TEST_RECIPIENT` constructs the synthetic eligible EMAIL ContactPoint. That address then passes through contact resolution, communication preparation, HUMAN approval, trusted current-state loading, send revalidation, and the normal execution boundary. It is never passed as a CLI argument and cannot select tenant, contact, channel, or draft identity.

`RECOVERIA_EMAIL_RECIPIENT_ALLOWLIST` is independent authorization only. It does not select the recipient. Real mode requires exactly one allowlist entry equal to the normalized ContactPoint value. A configured dry-run allowlist must also match exactly.

## Four-part real-send gate and confirmation

Dry-run is the default. A future provider crossing requires all of these conditions:

1. `RECOVERIA_CONTROLLED_SMOKE_TEST_ENABLED=true`;
2. `RECOVERIA_REAL_PROVIDER_SEND_ENABLED=true`;
3. server-side Resend credential and sender configuration;
4. one exact allowlist entry matching the resolved synthetic ContactPoint.

It additionally requires `RECOVERIA_SMOKE_TEST_CONFIRMATION=SEND_ONE_SYNTHETIC_EMAIL`. The phrase contains no recipient and cannot be inferred from another setting. Missing or invalid mode, recipient, smoke gate, confirmation, provider gate, credential, sender, allowlist, or database authorization fails before any provider can run.

No credential uses `NEXT_PUBLIC_*`, no secret is logged, and no personal address is hardcoded.

## HUMAN approval, trusted loading, and safety state

The scenario records an explicit HUMAN actor named `controlled-smoke-test-human-operator` with reason `Controlled smoke-test human authorization`. SYSTEM approval is rejected by the unchanged approval chain.

The execution request contains no current state. A loader internal to the harness verifies the fixed tenant, case, draft, and approval identities and returns the internally constructed current state. The harness explicitly calls `advanceSafetyState` before executing, then gives the loader the resulting version and fingerprint. A change between initialization and claim produces `SAFETY_STATE_CHANGED` and zero provider calls.

This is **SMOKE-TEST-ONLY INITIALIZATION**. It does not close the production P2: every future real safety-critical state writer must transactionally advance durable safety state before Client Zero sending can be considered.

## Database boundary

Default dry-run uses an in-memory execution store and never reads any database URL. Future real mode reads only `RECOVERIA_SMOKE_DATABASE_URL`; it never falls back to `DATABASE_URL`. It also requires `RECOVERIA_SMOKE_DATABASE_ALLOWLIST=recoveria-controlled-smoke` and a database name visibly containing both `recoveria` and `smoke`.

The CLI initializes only the fixed synthetic Organization and CollectionCase if absent, then uses `PrismaCommunicationExecutionStore`. It does not apply migrations automatically, connect to production automatically, or use the disposable integration-test variable. Existing incompatible rows fail closed.

## Dry-run and idempotency

Dry-run constructs and validates the complete synthetic scenario, approval, trusted loader, safety-state initialization, recipient resolution, content, execution claim, attempt, and outcome through `CommunicationExecutionService`. Its injected `ControlledSmokeDryRunProvider` returns a local `DRY_RUN_PROVIDER_NETWORK_DISABLED` outcome and has no HTTP capability. The verified CLI result is zero provider network calls and zero emails.

There is one fixed logical draft and no loop, batch, schedule, automatic retry, or draft regeneration. Repeating execution with the same durable store produces `DUPLICATE_REQUEST` and no second provider crossing for ACCEPTED, FAILED, or UNKNOWN. UNKNOWN is reported as `UNKNOWN — reconciliation required`; the CLI does not retry.

## Fixed-tenant webhook adapter

No public webhook route is added in this phase. `ControlledSmokeResendWebhookAdapter` is a future one-off adapter around the existing `ResendDeliveryWebhookService`. It binds tenant identity in code to `org-recoveria-controlled-smoke-test` and rejects any input containing `organizationId`. Tenant cannot come from query, body, header, provider payload, or path.

The adapter preserves existing raw-body signature verification and immutable delivery persistence. It neither logs raw bodies nor exposes secrets and has no financial mutation API. This is explicitly smoke-test-only and is not a production multi-tenant webhook architecture.

## Future explicitly authorized runbook

Do not perform these steps without a new, explicit human authorization for the real self-email:

1. Provision a dedicated, migrated RecoverIA smoke database whose database name includes `recoveria` and `smoke`.
2. Configure `RECOVERIA_SMOKE_DATABASE_URL` and exact database allowlist without printing either value.
3. Configure one founder-owned address as `RECOVERIA_SMOKE_TEST_RECIPIENT` and independently as the sole recipient allowlist entry.
4. Configure the reviewed sender and Resend credential server-side.
5. Set both enablement flags and the exact confirmation phrase only for the one operator process.
6. Run `npm run smoke:email:controlled` with no arguments exactly once.
7. If ACCEPTED, reconcile delivery through the fixed-tenant signed webhook adapter. If FAILED or UNKNOWN, do not retry or create another draft; investigate manually.
8. Remove enablement, confirmation, recipient allowlist, credential, and temporary smoke configuration after the authorized observation.

This document does not authorize those steps. Real provider calls and real emails remain zero in Phase 5B.4C.1.
