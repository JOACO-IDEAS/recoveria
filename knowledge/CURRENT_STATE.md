# Current state

This file captures only *current operational truth*. For the detailed turn-by-turn record of how we got here, see [docs/agent-handoffs/CURRENT_HANDOFF.md](../docs/agent-handoffs/CURRENT_HANDOFF.md) (untracked, always more current than this file for "what just happened"). For how we got from Phase 0 to here, see the root `RECOVERIA-*.md` files and `docs/RECOVERIA-PHASE-*.md`.

## Phase 7C Engineering: **CLOSED**

The online staging architecture is proven end-to-end, with zero Google Drive provider execution in the proving probe:

```
founder browser → Vercel → staging BFF → WIF → Product API → durable async state
→ Cloud Tasks → OIDC → Cloud Run worker → application execution → durable SUCCEEDED
```

Final proof: a no-provider `StagingAsyncProbe` reached durable `SUCCEEDED` online, with exactly one logical execution, zero Drive/provider calls, and every durable baseline (checkpoint, corpus counts, OAuth lifecycle, IAM) unchanged. Full evidence trail is in `CURRENT_HANDOFF.md`'s "FINAL probe — SUCCEEDED" section.

### Deployed staging components (authoritative as of this writing — verify against `CURRENT_HANDOFF.md` or live `gcloud`/`vercel` state before relying on exact revision IDs, they change every deploy)

| Component | Service/project | Notes |
|---|---|---|
| Public staging URL | `staging-recoveria.vercel.app` | Vercel project `staging-recoveria` |
| Product API | Cloud Run `recoveria-staging-api`, project `recoveria-pilot` | Runs the same root Next.js app via `next start`; invoker restricted to `recoveria-staging-bff` |
| Sync/probe worker | Cloud Run `recoveria-staging-worker`, project `recoveria-pilot` | Separate composition (`scripts/staging/run-sync-worker.ts`); invoker restricted to `recoveria-staging-tasks` |
| Task queue | Cloud Tasks `recoveria-staging-sync`, region `southamerica-east1` | OIDC-authenticated HTTP targets only |
| Database | Neon Postgres `recoveria_pilot` / `recoveria-pilot` project | Staging-synthetic only — see isolation rule below |
| WIF chain | `recoveria-vercel-staging/vercel-staging` → `recoveria-staging-bff` SA | Vercel OIDC → GCP Workload Identity Federation → Cloud Run ID token |

## Synthetic corpus

- 40 documents, 39 unique, 1 exact duplicate.
- Drive checkpoint: version 5.
- OAuth/connection lifecycle: `CONNECTED`.
- **Purpose: regression/staging only.** This corpus is frozen — it exists to prove the architecture and catch regressions, not to be grown or treated as representative of real invoices. See `RECOVERIA-SYNTHETIC-DOCUMENT-CORPUS.md` for its exact composition (40 documents deliberately including scan-only PDFs, CSV/XLSX, malformed files, exact and near-duplicates, and 6 administration-name spelling variants).

## Historical dead probes (informational only, not operationally relevant)

Two earlier `StagingAsyncProbe` rows (`808899be-...`, `62991307-...`) are permanently `PENDING` — the first from a pre-existing Cloud Tasks IAM gap (since fixed), the second from an application-level header-parsing bug (since fixed). Both are preserved untouched as historical evidence of the debugging process. See `CURRENT_HANDOFF.md` if the detail is ever needed; it is not relevant to current or future work.

## Current next milestone

**PHASE 8 — CLIENT ZERO READ-ONLY: CHRISTOPHERSEN ASCENSORES**

Real data: yes. Real collection actions: no. Goal: begin learning from and operating over real Christophersen Ascensores invoices while maintaining strict isolation, provenance, uncertainty, security, and documentary/accounting separation. **Real Client Zero data access is still not authorized.** The readiness design is in [CLIENT_ZERO_READINESS.md](CLIENT_ZERO_READINESS.md).

### Phase 8A — CLOSED (environment provisioned and proven empty)

A first-class, isolated `CLIENT_ZERO_READ_ONLY` environment now exists and is proven empty:

- Separate Postgres database `recoveria_client_zero` (same Neon endpoint/GCP project as staging, but a hard-isolated database with its own least-privilege role `recoveria_client_zero_owner` — cannot query staging's tables, confirmed directly). All 44 tables from the current schema applied via `prisma migrate deploy`; every table is empty.
- Connection string lives only in a new Secret Manager secret, `recoveria-client-zero-database-url`, with zero IAM accessor grants (no service account has been given access yet — correctly nothing needs it before Phase 8B).
- One `Organization` row (`recoveria-client-zero`) and one `OWNER` `Membership` row (`founder-operator`) — the only two rows in the entire database. No synthetic tenant identity was reused.
- `src/modules/staging/environment.ts`: the environment enum's old, never-wired `PRODUCTION_CLIENT_ZERO` placeholder was renamed to `CLIENT_ZERO_READ_ONLY` (misleading "PRODUCTION" framing removed — Phase 8 is explicitly read-only). New `parseClientZeroEnvironment`/`parseClientZeroWorkerEnvironment` fail closed on: wrong environment value, any non-`recoveria_client_zero` database (including the real staging DB, `recoveria_test`, `recoveria_smoke`, or anything ConcilIA-looking), any staging/synthetic-flavored organization or connection id, and any attempt to set a collections/outbound-communication capability flag. `assertEnvironmentSeparation` is now bidirectional and wired into both staging and Client Zero parsing.
- `src/modules/client-zero/environment-preflight.ts` (+ `npm run client-zero:environment-preflight`): a runtime-identity preflight distinct from the existing git-boundary preflight, checked live against both a deliberately-wrong config and the real provisioned secret.
- `src/modules/client-zero/kill-switch.ts`: ingestion is disabled by default; a future Phase 8B ingestion dispatcher must call `assertClientZeroIngestionAllowed()` before any provider read.
- **Deferred to Phase 8B, deliberately not built yet** (nothing requires it before real ingestion exists): dedicated Cloud Run worker/API, dedicated Cloud Tasks queue, real OAuth client/Drive connection, any service-account IAM grant on the new secret. See `CLIENT_ZERO_READINESS.md` and `CURRENT_HANDOFF.md` for the full reasoning.
- **Zero Client Zero invoice content was accessed.** Zero real Drive calls. Zero collections/outbound activity. All confirmed in `CURRENT_HANDOFF.md`'s Phase 8A section.

See [ROADMAP.md](ROADMAP.md) for the full phase sequence and [tasks/BACKLOG.md](../tasks/BACKLOG.md) for what's actionable now vs. deferred.
