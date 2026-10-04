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

### Phase 8B.1 — CLOSED (20-invoice canary processed, aggregate-only)

Under named data-owner authorization (Approval #3, scoped to exactly this 20-document corpus for documentary-intelligence development only), the existing authorized 20 real Christophersen Ascensores invoices were processed through the current documentary pipeline and durably persisted into `recoveria_client_zero` — **aggregate results only below; no real invoice value appears in this file, `CURRENT_HANDOFF.md`, or any committed artifact.**

- All 20 documents processed, 0 processing failures, 0 duplicates (exact or possible). All 20 flagged review-required (consistent with the invariant that no candidate is promoted to confirmed truth without human review).
- Field coverage (count out of 20): invoice number 20, issue date 20, nominal amount 20, currency 20, provenance-backed observations 20. Documented due date 0/20 — consistent with, and now reconfirmed independently of, the historical Phase 4.6A finding that this cohort's invoices never state an explicit payment due date (not an extraction failure).
- 2 point-of-sale series variants, 7 proposed customer identity clusters (all status `PROPOSED`, none `CONTRADICTED`/`AMBIGUOUS`) — both figures corroborate the historical Phase 4.6A sanitized discovery exactly.
- 229 document-relationship proposals (140 flagged contradicted, 179 review-required, 9 unmatched signals) — all non-definitive, reviewable proposals; nothing was merged or promoted automatically.
- Durable persistence used the schema's existing manual-import model (`ImportBatch` → `SourceDocument` → `ExtractionResult`/`ExtractedField` → `InvoiceImportCandidate`), which has no `ConnectedSource` relation at all — the source truthfully records as a local/manual import, never a fabricated Drive connection. No `Invoice`/`Party` row was materialized from any candidate (that promotion step requires human confirmation, out of scope for this canary).
- A sanitized per-invoice ground-truth review manifest exists under the private Client Zero boundary (`.private/client-zero/analysis/`, gitignored, 0600, never committed) for founder manual verification — see `CURRENT_HANDOFF.md` for exactly what it contains and doesn't.
- **Product Surface readiness finding:** the deployed Product Surface read model (`src/modules/product-surface/read-model.ts` + `prisma-checkpoint-reader.ts`) reads exclusively from `DriveSourceCheckpoint`, not from the `SourceDocument`/`ExtractionResult`/`InvoiceImportCandidate` tables this canary wrote to. These are two parallel, currently-disconnected persistence shapes. The smallest next step toward a private Client Zero Product Surface is additively persisting a `DriveSourceCheckpoint` row (`sourceType: "LOCAL_FOLDER"` — the field is a plain string, not Drive-locked, so this is truthful, not fabricated) carrying the same understanding results in the shape the read model already expects. Not done this turn — no Product Surface was built, wired, or deployed.
- Zero Drive/OAuth/Catedral calls. Zero collections/outbound activity (structurally impossible per Phase 8A's capability-flag rejection). Staging re-verified byte-for-byte unchanged before and after.

### Phase 8B.2 — CLOSED (private ground-truth review workspace built, ready for founder use)

A local-only, never-deployed review tool now exists so the founder can turn Phase 8B.1's pipeline output into verified ground truth:

- Launch: `npm run client-zero:export-review-proposals` (one read-only DB snapshot, zero writes) then `npm run client-zero:review-server` (binds `127.0.0.1` only — confirmed via `lsof`, never `0.0.0.0`, never deployed). Opens at `http://127.0.0.1:4873/`.
- Per invoice: original PDF rendered inline, pipeline-proposed value + provenance shown per field, with issuer/billed-party/administration/building/address kept as distinct roles (never collapsed into one "entity").
- Ground truth lives in a separate private file (`.private/client-zero/analysis/phase-8b2-ground-truth.json`, gitignored, 0600) that never overwrites extraction output — confirmed all 20 documents/all fields start `UNREVIEWED`; only an explicit founder action can change a label. Labels persist across a server restart (proven directly: saved a label, restarted the process, confirmed it reloaded from disk) — the file was then reset to a pristine all-`UNREVIEWED` state before this phase closed, so no test artifact remains.
- An evaluator (`src/modules/client-zero/ground-truth-evaluation.ts`, pure/unit-tested) is ready to compute per-field correct/incorrect/not-present/uncertain counts, accuracy only where mathematically justified, false-extraction-when-absent vs. missed-extraction-when-present, and a document-level perfect-extraction rate — but reports all-zero/null until the founder actually labels something, confirmed live.
- Zero Client Zero database mutation this phase (the snapshot step is read-only); zero Drive/Catedral/outbound activity; staging re-verified unchanged.

### Phase 8B.2A — CLOSED (independent documentary verification layer)

The same authorized 20-PDF private corpus now has a second, blind documentary observation layer, generated locally with Apple Vision OCR/PDFKit rather than the production `pdfjs-dist` extraction path. The verifier executable cannot import or read pipeline proposals or founder labels; its private observation artifact is written first, and only a separate comparator may subsequently read both layers.

- All 20 PDFs were observed. Each of the 10 required documentary roles records `FOUND`, `NOT_FOUND`, or `AMBIGUOUS`, normalized/raw observations, confidence, page/provenance, provider/version, and timestamp. Documented due date remains strict: no inference from issue date or service period.
- The private comparison artifact reports machine agreement and review workload only — never accuracy. Across 180 comparable field observations: 60 matches, 40 absent-agreements, 60 disagreements, 20 ambiguous, for 100 auto-verifiable and 80 human-required observations. Service/billing period is separately observed (2 found, 18 not found).
- The private local workspace now shows four explicit layers (`RECOVERIA`, `INDEPENDENT VERIFIER`, `COMPARISON`, `FOUNDER GROUND TRUTH`), preserves the existing founder labels, prioritizes exception queues, and clearly warns that machine agreement is not documentary accuracy.
- Both new private artifacts remain gitignored and mode `0600`; no real document value, filename, or credential is committed. No database write, provider request, pipeline tuning, deployment, collections/outbound action, or accounting/debt assertion occurred.
- Follow-up runtime audit 8B.2A.1 found and corrected a stale-process consistency defect: an old 8B.2 server process could serve the new UI assets while retaining the old API closure, silently rendering absent layers as `NOT COMPARABLE`. The workspace now exposes a versioned canonical server-side field model, fails visibly on schema/layer mismatch, derives its summary from the exact records served to the UI, and rejects persisted aggregate drift. All 180 comparable UI statuses were proven equal to the persisted comparison records; the aggregate metrics above remain unchanged.

See [ROADMAP.md](ROADMAP.md) for the full phase sequence and [tasks/BACKLOG.md](../tasks/BACKLOG.md) for what's actionable now vs. deferred.
