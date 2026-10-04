# Roadmap

This supersedes the sequencing in `RECOVERIA-PHASE-PLAN.md` for anything from here forward. That file's Phase 0-10 numbering reflected the original pre-implementation plan; actual build history diverged from it early (see the `RECOVERIA-PHASE-4.*`/`5*`/`6*`/`7*` docs for what was actually built, under a different numbering scheme). Treat `RECOVERIA-PHASE-PLAN.md` as historical context for *why* certain invariants exist, not as the current sequence. See [DECISIONS.md](DECISIONS.md) for this as a logged decision.

**Labels below are not implementation commitments.** If repository evidence at the time a phase starts suggests a better subdivision, subdivide — don't force work into a label that no longer fits, the way the original Phase Plan's numbering stopped fitting.

## 7C — Online staging architecture

**CLOSED.** Proven end-to-end with zero Drive provider execution. See [CURRENT_STATE.md](CURRENT_STATE.md).

## 8 — Client Zero Read-Only

**NEXT. Not yet authorized to begin execution.** Real data: yes. Real collection actions: no. Full readiness design and gate: [CLIENT_ZERO_READINESS.md](CLIENT_ZERO_READINESS.md).

- **8A** — Client Zero isolation/readiness. **CLOSED.** Environment provisioned and proven empty/isolated (separate database, first-class environment type, fail-closed cross-checks, kill switch, preflight). See `CURRENT_STATE.md`.
- **8B** — Real invoice corpus ingestion. **8B.1 (20-invoice canary), 8B.2 (private founder review), and 8B.2A (blind independent verification) CLOSED** — aggregate results in `CURRENT_STATE.md`. Scaling to the full 200-500 representative sample remains separately gated.
- **8C** — Extraction + provenance quality (measured against a human-reviewed ground-truth sample, not visual impression — readiness doc points 5-6).
- **8D** — Identity/relationship quality (entity resolution against real administrations/consorcios, same precision-over-recall policy as [INVARIANTS.md](INVARIANTS.md)).
- **8E** — Real Product Surface documentary view (the founder can open a real invoice and see original PDF + extracted facts + confidence + provenance + uncertainty — readiness doc point 7 — with no balance/payment-status claims).

## 9 — Catedral Read-Only / Accounting Truth

Direct Catedral connection for structured accounting data (preferred) or, as fallback only, a Catedral→Drive→Recoveria export path. See [DATA_SOURCES.md](DATA_SOURCES.md). This is what finally closes the evidence-chain gap Phase 8 deliberately leaves open (invoice existence → payment status).

## 10 — Real Portfolio / Receivable State

Real aging, real balances, real concentration — only once 9 supplies the accounting-truth link. Before this, any "balance" shown anywhere for real data is a bug, not a preview feature.

## 11 — Contacts + Case Intelligence

Real `CollectionCase`/`Contact`/`ContactPoint` workflow over real entities — still no outbound sending.

## 12 — Collections Dry Run

Human-operated, no real outbound communication yet — proving the recommendation/case workflow against real data before any sending capability is even discussed.

## 13 — Limited Approved Actions

The first real, human-approved, narrowly-scoped outbound or action capability — a new, separate, explicit founder authorization gate, not an extension of anything in 8-12.

## 14 — Progressive Policy-Based Automation

Only after measured evidence from 13 justifies expanding scope — fairness/error-mode review before any widening, per the original Phase 10 exit criteria in `RECOVERIA-PHASE-PLAN.md`.

## Cross-cutting gates (unchanged across every phase above)

Tenant isolation, immutable evidence, human authority, security real-data gate checklist (see [SECURITY.md](SECURITY.md)), observability without sensitive logs, migration rollback/restore planning, and explicit architecture decisions before provider/infra selection. Every phase is a separate authorization gate — completing one does not automatically authorize the next.
