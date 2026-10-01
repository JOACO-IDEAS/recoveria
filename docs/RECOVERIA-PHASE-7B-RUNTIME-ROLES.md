# Phase 7B runtime roles

The existing core Next application is the Product API composition root. Phase 7C will bind its session, Connected Sources, Product Surface, and preview route handlers to the staging Prisma repositories and exact Cloud Run audience.

The sync worker is a separate private Cloud Run composition of `StagingSyncWorker`, `PrismaStagingSyncTaskRepository`, `PrismaSyncIntentRepository`, and the existing Connected Source sync engine. Its ingress accepts Cloud Tasks OIDC only; the task name is deterministic and database state is authoritative.

The OAuth callback remains a distinct narrowly public runtime using the existing audited callback domain service. It shares no Product API route surface. Callback logging hardening in `infra/staging/callback-logging-hardening.md` is a deployment gate.

This phase intentionally supplies composition contracts rather than live entrypoints containing credentials or provider calls. Phase 7C must wire service identities, secret references, and health checks after provisioning approval.
