# RecoverIA WhatsApp Intelligence V1.1

## Scope and compatibility audit

V1.1 preserves V1 and extracts a host-neutral CRM boundary. The commercial VPS was not accessed and this repository is not assumed to match production.

The channel-compatible extension keeps that boundary intact and adds a normalized contract for authorized personal imports, Business App Coexistence, and Cloud API. See `docs/WHATSAPP_CHANNELS_V1_1.md`.

Reusable without infrastructure assumptions:

- Meta subscription challenge and raw-body HMAC verification.
- Meta payload parsing for text plus image/document metadata.
- Tenant resolution by business `phone_number_id`.
- Conversation interpretation interface, deterministic mock, and OpenAI Responses adapter.
- Strict interpretation schema, evidence validation, prompt-injection boundary, usage/cost accounting, limits, retries, idempotency, and simulator.
- Candidate-event rule that never treats a message or receipt as accredited/conciled money.

Legacy/infrastructure-dependent pieces:

- `runtime.ts`, `prisma-store.ts`, Prisma schema/migration, and `PrismaCrmInvoiceCatalog` depend on Prisma/PostgreSQL.
- Deployment documents describe Vercel, Cloud Run, Cloud Tasks, and Neon for the audited repository. They are not evidence of the current Hostinger VPS architecture.
- No Supabase integration was found in the WhatsApp module.
- The existing worker command assumes the Prisma job tables and needs a host-specific durable runner.

## V1.1 CRM boundary

`RecoveriaCrmAdapter` is independent of ORM, database, and hosting provider. It exposes:

- `findDebtor()`
- `findInvoice()`
- `getOutstandingBalance()`
- `createConversationEvent()`
- `createPaymentReportedEvent()`
- `createPaymentPromise()`
- `scheduleFollowUp()`
- `flagForReview()`

`SyntheticRecoveriaCrmAdapter` implements the complete port with tenant-scoped synthetic data and durable-in-process idempotency. The simulator shows each operation that a real adapter would request and labels every operation `accountingEffect=NONE`.

`TransportRecoveriaCrmAdapter` implements the same port over an injected authenticated transport. It intentionally contains no URL or invented endpoint. The versioned envelope is documented in `docs/contracts/RECOVERIA_CRM_ADAPTER_V1.md`.

`ReadOnlyCatalogRecoveriaCrmAdapter` only preserves compatibility with the audited Prisma repository. Reads use the existing catalog; writes are returned as `PROPOSED` and canonical CRM mutation remains disabled.

## Functional prototype

Run:

```bash
RECOVERIA_ENVIRONMENT=LOCAL npm run dev -- -H 127.0.0.1 -p 3000
```

Open `http://127.0.0.1:3000/whatsapp`.

The prototype receives synthetic messages, interprets them, finds a synthetic debtor/invoice, creates CRM operations through `RecoveriaCrmAdapter`, and displays the proposed effects. Scenarios include partial payment with receipt and Thursday promise, duplicate receipt, ambiguous debtor, ambiguous invoice, broken promise, dispute, multi-message context, and webhook replay.

The OpenAI adapter follows the official Responses API `text.format` Structured Outputs contract and revalidates with Zod. `gpt-6-luna` remains configured but project availability is untested until an authorized `OPENAI_API_KEY` exists. No OpenAI request was made for V1.1.

## Minimum information required from the commercial backend

Provide documentation or sanitized configuration—not passwords or VPS access—for:

1. Exact application repository and deployed commit/image version.
2. Runtime language, framework, versions, process manager, containerization, and directory/service layout.
3. Reverse proxy and TLS topology: Nginx/Apache/other, public hostname, request-size limits, timeouts, and raw-body preservation.
4. Deployment workflow, rollback method, CI/CD, health checks, and non-production environment.
5. Existing API base URL and OpenAPI/schema documentation, if any.
6. Service-to-service authentication mechanism and how tenant authorization is enforced.
7. Canonical identifiers and read models for company, debtor, contact/phone, invoice, receivable, balance, case, payment claim, promise, follow-up, review task, and conversation event.
8. Existing commands/endpoints for creating those operational records and which are safe for a synthetic tenant.
9. Durable idempotency behavior and supported idempotency header/key.
10. Authoritative source for accredited/conciled payments and the boundary that prevents WhatsApp from mutating it.
11. Database engine and migration tool only to understand compatibility; no direct database credentials are needed or desired.
12. Queue/background-job mechanism, retry/dead-letter behavior, scheduler, and concurrency controls.
13. File-storage pipeline for attachments: allowed MIME types/sizes, antivirus or content-disarm service, encryption, retention, and deletion.
14. Secrets manager/environment-variable mechanism and rotation procedure.
15. Audit/logging/metrics/error-reporting facilities and PII-redaction policy.
16. Existing follow-up approval rules and whether outbound WhatsApp messages are prohibited, drafted, or human-approved.
17. A synthetic organization, debtor, invoice, and expected balance for integration tests.
18. Meta app ownership model and approved public callback hostname.

## First official Meta test plan

1. Audit the real backend contract using the information above.
2. Implement only the host-specific authenticated transport mapping to existing interfaces.
3. Run its contract tests against a synthetic environment and verify tenant rejection/idempotency.
4. Select a public HTTPS callback that preserves the raw request body and exposes only the webhook boundary.
5. Configure Meta's official test number, verify token, App Secret, Phone Number ID, and `messages` subscription in the environment secret store.
6. Start with `WHATSAPP_INTERPRETER_PROVIDER=mock`; send one allowlisted test message and verify receipt, signature, deduplication, event, adapter operation, and audit trail.
7. Configure an authorized OpenAI project key and verify `gpt-6-luna` with one isolated Responses request.
8. Switch only the synthetic tenant to `openai`, enforce a low budget, and compare labeled mock/OpenAI results.
9. Keep attachments metadata-only until the secure file pipeline is approved.
10. Keep outbound follow-ups disabled until explicit business authorization and Meta template rules are implemented.
