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

Real data: yes. Real collection actions: no. Goal: begin learning from and operating over real Christophersen Ascensores invoices while maintaining strict isolation, provenance, uncertainty, security, and documentary/accounting separation. **Client Zero access is not yet authorized.** The readiness design and gate are in [CLIENT_ZERO_READINESS.md](CLIENT_ZERO_READINESS.md); nothing in that document authorizes execution.

See [ROADMAP.md](ROADMAP.md) for the full phase sequence and [tasks/BACKLOG.md](../tasks/BACKLOG.md) for what's actionable now vs. deferred.
