# Deployment and environment boundaries

This document describes architecture and ownership boundaries. It is not authorization to deploy or mutate infrastructure.

## Local

Purpose: product development, synthetic fixtures, tests, and builds. PostgreSQL is optional for most work and, when used, must be disposable/local. No real provider, customer document, email delivery, or cloud credential is needed.

## Synthetic staging

Purpose: prove the real runtime topology using only a frozen synthetic corpus.

```text
browser → Vercel web/BFF → Workload Identity Federation → private Cloud Run Product API
                                                       → Postgres
                                                       → Cloud Tasks/OIDC → private worker
```

- Vercel hosts the staging web/BFF and obtains short-lived identity; it must not receive Drive credentials or database administration access.
- Cloud Run hosts separately restricted Product API and worker runtimes.
- Cloud Tasks provides durable authenticated dispatch.
- Neon/Postgres stores synthetic staging state.
- Google Drive supplies documentary input through read-only, root-bounded access.
- Google OAuth establishes provider access; credentials are encrypted/referenced, never embedded in Git.
- KMS protects credential envelopes; Secret Manager stores server-only configuration.
- Email delivery code remains founder-gated; its presence authorizes no real send.

Phase 7C proved this chain with a no-provider probe. Do not rerun Drive sync, deploy, change IAM/OAuth, or modify the synthetic baseline for handoff verification.

## Client Zero read-only

Purpose: learn from a narrowly authorized real-document corpus without collections or accounting claims.

- Uses a separate database/environment identity from synthetic staging.
- Source documents, extracted private artifacts, independent-verification output, and founder ground truth stay outside Git.
- A prior 20-document canary was processed under scoped authorization; this does not authorize more documents, Drive access, public exposure, or outbound action.
- Dedicated compute/queue and a real Drive/OAuth connection remain future, separately approved decisions.

Never reuse staging tenant, checkpoint, Drive root, OAuth state, credentials, log stream, or task identity for Client Zero.

## Production and public/demo surfaces

There is no broad customer production environment. Synthetic staging is not production, and Client Zero is explicitly read-only. The root synthetic UI must not be represented as live customer truth.

## Deployment inputs

- Root runtime: `Dockerfile`, `deploy/Dockerfile.product-api`, `deploy/Dockerfile.worker`, and Cloud Build definitions.
- Staging web/BFF: `apps/web` and `apps/web/vercel.json`.
- Inert infrastructure record: `infra/staging/`.

Cloud Run images execute TypeScript entrypoints through `tsx`; generated esbuild artifacts are not the authoritative deployment path.

## Never touch casually

Vercel; Cloud Run; Cloud Tasks; IAM/WIF; KMS/Secret Manager; Neon databases, roles, backups, or migrations; Google OAuth/Drive; email configuration or recipients; Client Zero private material; and any future production resource. Every mutation needs current scoped founder authorization, preflight, validation, and handoff. Repository access alone grants no operational access.
