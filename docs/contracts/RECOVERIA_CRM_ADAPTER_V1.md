# RecoverIA CRM Adapter Contract V1

Status: proposed integration boundary for WhatsApp Intelligence V1.1. It does not assert that any endpoint already exists in the commercial backend.

Contract identifier: `recoveria.crm-adapter.v1`.

## Purpose

The WhatsApp module depends on `RecoveriaCrmAdapter`, never on Prisma, Neon, Supabase, Vercel, Cloud Run, Hostinger, or a particular database. A host-specific transport maps this contract to an existing, authorized backend interface after that interface is audited.

No endpoint path is prescribed here. The commercial backend owner must supply the real base URL/path or approve a new integration route. WhatsApp must never write directly to the commercial database.

## Request envelope

Every operation carries:

- `contractVersion`: exactly `recoveria.crm-adapter.v1`.
- `organizationId`: server-derived tenant identifier; never accepted from an end-user message.
- `requestId`: unique correlation identifier.
- `idempotencyKey`: stable key derived from the Meta message id and operation.
- `source`: `WHATSAPP`.
- `operation`: one of the versioned operation names below.
- `payload`: operation-specific data.

The authenticated transport must bind its service identity to the allowed `organizationId`. A caller authenticated for tenant A must not be able to select tenant B by changing the envelope.

## Operations

| Operation | Purpose | Mutates accounting truth |
|---|---|---|
| `debtor.find` | Resolve a debtor by safe identifiers | No |
| `invoice.find` | Resolve invoice references within a tenant/debtor | No |
| `invoice.outstanding-balance.get` | Read the current authoritative or qualified balance | No |
| `conversation-event.create` | Preserve the structured conversation observation | No |
| `payment-reported.create` | Record a debtor payment claim | **No** |
| `payment-promise.create` | Record a promise without confirming payment | No |
| `follow-up.schedule` | Propose or schedule an authorized follow-up | No accounting effect |
| `review.flag` | Create a human-review item | No |

`payment-reported.create` must persist `accreditationStatus=PENDING`, `reconciliationStatus=PENDING`, and `accountingEffect=NONE`. Only an existing financial/conciliation authority may later confirm or allocate funds.

## Response envelope

- Same `contractVersion` and `requestId` as the request.
- `ok` boolean.
- `result` when successful.
- Safe `error.code` and `error.retryable` when unsuccessful.

Write results include an operation id, idempotency key, status, target id where applicable, human-readable safe summary, and `accountingEffect=NONE`.

## Authentication and authorization requirements

- TLS only.
- Server-to-server identity; no browser token or shared user password.
- Short-lived signed token, mTLS, or the commercial backend's existing service-auth mechanism.
- Explicit scope for each operation and organization.
- Idempotency enforced durably by `(organizationId, idempotencyKey, operation)`.
- Request body and service identity included in audit logs without message text, secrets, access tokens, or attachment contents.
- Bounded timeouts and retry-safe error classification.

## Host-specific binding still required

Before implementing the transport, RecoverIA must provide the existing backend API/OpenAPI contract, authentication mechanism, canonical organization/debtor/invoice/case identifiers, idempotency behavior, and approved write commands. The adapter will then map these operation names to those real interfaces instead of inventing routes.
