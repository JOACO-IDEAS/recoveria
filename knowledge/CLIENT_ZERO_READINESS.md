# Phase 8 — Client Zero Read-Only readiness

**This document is a design and gate. It does not authorize Client Zero access, Drive connection, OAuth creation, infrastructure provisioning, or any processing of real invoice content.** Every numbered recommendation below still needs its own explicit founder authorization before execution, per [SECURITY.md](SECURITY.md) and `AGENTS.md`.

Goal of Phase 8: begin learning from and operating over real Christophersen Ascensores invoices — read-only, no real collection actions — while maintaining strict isolation, provenance, uncertainty, security, and documentary/accounting separation (see [INVARIANTS.md](INVARIANTS.md)).

## What already exists (inspected this turn, metadata/code only — no invoice content opened)

- **Historical real-data evaluation already happened, twice, under prior authorization:**
  - Phase 4.6A: a sanitized discovery pass over a 20-invoice authorized cohort. Fully committed and safe to read: `docs/RECOVERIA-PHASE-4-6A-CLIENT-ZERO-DISCOVERY-SANITIZED.md`. Key finding already on record: none of the 20 real invoices contain payment due date, administration name, prior balance, or payment status — the documentary/accounting split in [INVARIANTS.md](INVARIANTS.md) is not theoretical, it's exactly what these documents look like.
  - Phase 4.6B: a private evaluation of the real document-understanding pipeline against the same cohort — 20/20 core-field extraction (document identity, issue date, fiscal authorization, tax ID, currency, nominal total, provenance), 0/20 explicit payment due dates (correctly, not a failure), zero network/OCR/database/production mutation. Summary: `docs/RECOVERIA-PHASE-4-6B-REAL-DOCUMENT-UNDERSTANDING.md`.
  - **Do not assume either evaluation is still correct or current.** The code has changed since; re-verify before relying on these numbers for a go/no-go decision.
- **A local private boundary already exists:** `.private/client-zero/` (`inbox`, `quarantine`, `temp`, `work`, plus historical `analysis`, `invoices`, `checkpoints` from the Phase 4.6A/4.6B work). Confirmed this turn: fully covered by `.gitignore` (`/.private/client-zero/**`), confirmed untracked via `git ls-files` (zero results). Roughly 11MB / 29 files total — consistent with a modest historical evaluation cohort, not a large corpus. **Not opened, read, or processed this turn** — existence and size confirmed via directory listing only, per this task's explicit boundary.
- **Reusable safety code already exists in `src/modules/client-zero/`:** a three-variable mode gate that fails closed (`mode.ts`), a Git-based preflight check that fails unless the private boundary is actually gitignored and nothing sensitive is tracked/staged (`preflight.ts`, exposed as `npm run client-zero:preflight` / `scripts/client-zero-preflight.mjs`), a safe logger that throws if a forbidden field name is logged (`safe-logger.ts`), a private-temp helper with `0700`/`0600` modes and guaranteed cleanup (`temp.ts`), an aggregate-only sanitized report shape with `screenshotsGenerated` hardcoded to `0` (`report.ts`), and a manifest field allowlist (`manifest.ts`). This is real, tested infrastructure — reuse it, don't rebuild it.

## 1. Environment isolation

**Recommendation: `CLIENT_ZERO_READ_ONLY` as a new environment value**, with its own database/project/runtime configuration, fully separate from `recoveria_pilot`/`STAGING_SYNTHETIC`. Same pattern Phase 7C already used for `STAGING_SYNTHETIC` vs `LOCAL` — a distinct `RECOVERIA_ENVIRONMENT` value the whole application fails closed around, not a flag layered onto the existing staging project.

**Do not provision this yet.** This is a recommendation to evaluate, not a request for the database/project to be created.

## 2. What must be isolated

At minimum, each of these needs its own Client-Zero-scoped instance, never shared with staging-synthetic:

| Resource | Isolation requirement |
|---|---|
| Database | Separate Postgres instance/project, not a schema/row flag inside `recoveria_pilot`. |
| Drive root/source | A distinct, newly-confirmed Drive folder root and `ConnectedSource` row — never reuse the synthetic root's identity even if folder structure looks similar. |
| OAuth connection/lifecycle | A fresh OAuth connection, credentials, and lifecycle state — not a reauthorization of the synthetic pilot's connection. |
| Source state/checkpoints | Fresh `DriveSourceCheckpoint`/execution ledger rows, scoped to the new organization/tenant. |
| Logs | Separate log stream/sink, or at minimum a hard filter so Client Zero events can never land in the same aggregated view as synthetic staging logs. |
| Task execution state | Separate Cloud Tasks queue (or equivalent), separate worker identity — mirroring the `recoveria-staging-tasks`/`recoveria-staging-worker` pattern but under a distinct name. |
| Product Surface tenant | A new `Organization` row, never the `recoveria-synthetic-pilot` tenant. |
| Auth/membership | Founder membership re-issued against the new organization; never assume the synthetic membership carries over. |
| Provider credentials | New KMS-encrypted credential envelope, scoped to the new connection — never the synthetic pilot's envelope. |
| Secrets | New Secret Manager secrets/versions under Client-Zero-specific names — never reuse `recoveria-pilot-database-url` or any existing staging secret name for real data. |
| Telemetry | If any telemetry/analytics exists, it must exclude Client Zero events or be scoped identically to the log isolation above. |
| Backups | A separate backup target/policy, with its own retention and access-control decisions — do not let a staging backup job accidentally sweep in real data once it's connected, or vice versa. |
| Exports | Any export path (CSV, report, debug dump) must be scoped so a Client Zero export can never be generated by code paths that also serve staging-synthetic, without an explicit environment check. |

## 3. What can safely be reused as code/architecture

Reuse the engineering, not the state:

- `DocumentSource` abstraction, `GoogleDriveSource`/`RealGoogleDriveClient` (already root-bounded, read-only, `drive.readonly` scope).
- `IncrementalCorpusProcessor` + checkpoint semantics.
- The document-understanding/extraction pipeline (`pdfjs-dist`-based native PDF decoding, semantic date typing, FACT/INFERENCE/UNKNOWN classification) — already privately evaluated once against this exact real cohort (Phase 4.6B), though that evaluation needs re-verification against current code.
- Provenance model (page/coordinate/method/version-tagged observations).
- Entity/relationship resolution logic (the two-deterministic-path policy, precision-over-recall).
- Product Surface read models and the Evidence Inspector architecture (`EvidenceInspectorProvider`, `DocumentViewer`'s `DocumentExtraction` adapter boundary — built exactly to let a real-document adapter slot in later).
- Async task architecture proven in Phase 7C (Cloud Tasks + OIDC + durable claim/complete pattern) — same shape, new queue/worker identity per the isolation table above.
- `src/modules/client-zero/*` safety primitives (mode gate, preflight, safe logger, private temp, sanitized report) — this is exactly the code meant to be reused, not reinvented.

**Do not reuse any synthetic *state*** — no synthetic organization ID, connection ID, checkpoint, or credential envelope. Code and architecture carry over; data and identity never do.

## 4. First real corpus strategy

**Not "upload everything available."** Recommend an initial representative sample of **approximately 200-500 real invoices**, chosen for coverage rather than volume:

- Multiple periods (not all from one month/quarter).
- Multiple consorcios/buildings.
- Multiple administrations (the historical cohort found six administration-name spelling variants even in just 20 synthetic documents in earlier testing — real spelling variance is exactly the kind of thing a 20-invoice sample can't surface reliably).
- Different invoice series/numbers (point-of-sale series variation was already observed in the real 20-invoice cohort).
- A spread of amount ranges, not just typical/median invoices.
- Known template variations (the Phase 4.6A cohort found exactly one template across 20 invoices — a larger sample is needed specifically to find out whether other templates exist at all).
- Duplicates/reissues, if genuinely present in the source — don't synthesize them, but don't exclude them either if the real corpus has them.
- Edge cases: scan-only (non-native-text) PDFs, unusual field ordering, missing fields.

**No current-debt assumptions** — the sample is chosen for documentary/extraction coverage, not for "the invoices we think are unpaid." That question isn't answerable yet (see [INVARIANTS.md](INVARIANTS.md)) and must not silently bias sample selection.

Why 200-500 and not more: the 20-invoice Phase 4.6A/4.6B cohort already proved the pipeline *can* work cleanly on a template it's seen; 200-500 is enough to surface template/series/administration variance and give the ground-truth sample below genuine statistical weight, without taking on the security/scope exposure of ingesting the entire real archive before the extraction pipeline has been measured against real labels at all.

## 5. Objective quality metrics (measured, not assumed)

At minimum, measure:

- Invoice number extraction accuracy.
- Issue date accuracy.
- Documented due-date accuracy (where present — the 4.6A cohort found 0/20 explicit due dates; the real rate may differ in a larger sample and must be measured, not assumed zero).
- Nominal amount accuracy.
- Currency accuracy.
- Entity candidate accuracy (administration/building/debtor candidates, measured against the two-deterministic-path resolution policy in [ARCHITECTURE.md](ARCHITECTURE.md)).
- Provenance availability (every extracted field should carry a page/coordinate reference — measure the rate where it's actually present).
- Duplicate detection (exact and possible-business-key) precision/recall.
- Abstention rate (fields correctly left `UNKNOWN` rather than guessed).
- Contradiction rate (fields flagged `CONTRADICTION` rather than silently resolved).
- Review-required rate.
- Template coverage (how many distinct visual templates the sample actually contains, and extraction success per template).
- Processing failures (parse errors, unsupported formats, malformed files).
- Incremental reuse/download behavior (does the checkpoint correctly skip unchanged documents on a second pass — directly testable without touching new content).

**No target percentages are proposed here** — there isn't yet a labeled real sample to derive them from, and inventing a number without evidence would violate the "no agent may silently convert uncertain evidence into a fact" invariant just as much in a planning document as in product code. Targets should be set *from* the ground-truth sample in point 6: run the pipeline once, measure actual accuracy against human labels, then set forward targets as "no regression below this measured baseline" rather than guessing a number first and hoping the data matches it.

## 6. Human-reviewed ground-truth sample

Recommend the founder (or a designated reviewer) manually label a statistically useful subset of the chosen corpus — **on the order of 50-100 invoices**, stratified across the same dimensions as point 4 (period, consorcio, administration, series, template) rather than randomly drawn, so every template/series variant that exists in the full sample is represented in the labeled subset at least once. Each labeled invoice records, by direct human read of the PDF: invoice number, issue date, due date if present, nominal amount, currency, and administration/building/debtor as the human reads it — independent of what the pipeline extracts.

Recoveria's extraction is then measured *against these human labels*, field by field — never against "does this look plausible," which is not a measurement. This labeled set is also the natural seed for the ground-truth regression fixture this phase leaves behind for future work.

## 7. First Product Surface success criterion

The founder should be able to open a real Christophersen invoice and see:

- The original PDF.
- Invoice number.
- Issue date.
- Documented due date, if present.
- Nominal documented amount.
- Currency.
- Candidate entity/consorcio/administration relationships, shown only where evidence actually supports them, with their confidence.
- Exact provenance/evidence (page/coordinate reference back to the source).
- Uncertainty/contradictions, shown explicitly rather than hidden.

**The UI must not claim:** unpaid, outstanding, overdue, legally claimable, or any payment status — until accounting evidence (Catedral, Phase 9+) actually supports that claim. This is the direct Product Surface expression of the documentary-vs-accounting-truth invariant in [INVARIANTS.md](INVARIANTS.md), and it is the single clearest acceptance test for whether Phase 8 has stayed in scope: if a real invoice's screen ever says "overdue" or shows a balance, something has leaked past the Phase 8 boundary.

## 8. Security/privacy gate before any real-data execution

Everything in [SECURITY.md](SECURITY.md)'s "Real-data gate checklist" applies in full: named data-owner authorization; dataset minimization; a threat model specific to the new `CLIENT_ZERO_READ_ONLY` environment; tenant isolation tests against the new environment specifically (not just a re-run of the staging tests); access roles; a secrets manager entry per new secret; encrypted storage/backups; malware scanning on anything ingested; a retention/deletion policy signed off by the data owner; subprocessor/model data-use review if any extraction step ever calls an external model API; an incident response plan; a tested restore of the new environment's backup; audit-log review; a masked-staging policy if any Client Zero data is ever mirrored for debugging; and a signed go/no-go record. Additionally specific to Phase 8: confirm the preflight check (`client-zero:preflight`) is adapted to check the *new* environment's isolation, not just the existing local `.private/client-zero/` boundary — a passing preflight today only proves the old boundary, not the new infrastructure.

## 9. Rollback / kill-switch behavior

- **Mode kill-switch:** mirror the existing three-variable gate pattern (`mode.ts`) — `CLIENT_ZERO_READ_ONLY` activation should require multiple explicit signals that all fail closed independently, not one flag.
- **Data rollback:** before any real ingestion, snapshot the new Client-Zero database, verify restore works, and record a rollback identifier — exactly the discipline in `RECOVERIA-CLIENT-ZERO-ROLLBACK.md`, now against a real (not nonexistent) database.
- **Immediate stop condition:** if real data is ever found somewhere it shouldn't be (synthetic DB, a log, a committed file), the existing rule applies unchanged — stop, do not inspect/copy/log/screenshot/parse it further, report only the boundary event without content.
- **Full exit:** unsetting the Client-Zero mode variables must provably return the application to `SYNTHETIC`/`STAGING_SYNTHETIC` behavior, the same way `RECOVERIA-REAL-DATA-MODE.md` already requires and already has a test for in the synthetic case.

## 10. Exact founder approvals required before Phase 8 execution

In order, each independently gated:

1. **Approval of this readiness design itself** — isolation model, corpus strategy, metrics, ground-truth approach, success criterion (points 1-7 above).
2. **Provisioning authorization** for the actual `CLIENT_ZERO_READ_ONLY` database/project/runtime (point 1-2) — infra creation, not yet data access.
3. **Named data-owner authorization** for a specific real corpus of a specific approximate size (point 4), with the owner explicitly aware no collection action will ever follow from this phase.
4. **Security gate sign-off** (point 8) — every item on the checklist has an owner and evidence, not just a plan.
5. **Authorization to actually ingest** the approved sample into the newly-provisioned, isolated environment.
6. **Separately, only after 1-5:** authorization to begin the human ground-truth labeling pass (point 6) and the quality-measurement work (point 5/7) against the ingested sample.

No step above is authorized by this document. This document is the design to be approved, not the approval itself.

## Summary verdict

**Not ready to execute today.** The code/architecture reuse surface is strong and mostly already proven (Phase 4.6B already extracted 20/20 core fields from the real cohort once, under prior authorization, with zero mutation). What's missing is entirely the isolation/provisioning/gate work above — none of which has started. Phase 8 execution should not begin until approvals 1-2 in point 10 are granted.
