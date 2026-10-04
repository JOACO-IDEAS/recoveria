# Decisions

Lightweight ADR-style log. Each entry: decision, why, status. Add new entries at the bottom; don't rewrite history — if a decision is later reversed, add a new entry that supersedes it and say so.

## The synthetic corpus is frozen as a regression/staging fixture

**Decision:** The 40-document synthetic corpus is not grown or evolved further. It exists solely to prove the architecture and catch regressions.
**Why:** Phase 7C's goal was proving the async infrastructure, not growing product fidelity on fake data. Growing it further would be effort spent learning nothing about real invoices.
**Status:** active. See [CURRENT_STATE.md](CURRENT_STATE.md).

## Client Zero is environment-separate from `recoveria_pilot`/`STAGING_SYNTHETIC`

**Decision:** Any future Client Zero real-data environment uses a separate database/project/runtime configuration, not the staging-synthetic one.
**Why:** Mixing real and synthetic data in one database makes every future query a potential real-data leak risk and makes the synthetic regression fixture unsafe to reset/modify freely.
**Status:** proposed, see [CLIENT_ZERO_READINESS.md](CLIENT_ZERO_READINESS.md) — not yet provisioned.

## Documentary vs. accounting truth is a structural, not cosmetic, separation

**Decision:** Google Drive (or any document source) is never allowed to answer balance/payment/legal questions. Those require a distinct, separately-sourced accounting truth layer (Catedral).
**Why:** The Phase 4.6A sanitized discovery of the real 20-invoice cohort found zero of the real invoices contained payment due date, administration name, prior balance, or payment status — confirming this isn't a theoretical risk, it's exactly what the real documents actually look like.
**Status:** active, encoded in [INVARIANTS.md](INVARIANTS.md) and [DATA_SOURCES.md](DATA_SOURCES.md).

## Drive is the documentary source; Catedral direct-connection is preferred over Drive-as-transport

**Decision:** When Catedral integration happens (Phase 9+), prefer a direct Catedral→Recoveria connection for structured accounting data. A Catedral→Drive→Recoveria export path is fallback transport only.
**Why:** Routing accounting data through Drive as a generic file-exchange mechanism would blur the documentary/accounting source boundary and make the separation above harder to enforce in code.
**Status:** proposed, applies starting Phase 9. See [DATA_SOURCES.md](DATA_SOURCES.md).

## No real collections communication during Client Zero Read-Only

**Decision:** Phase 8 is read-only with respect to any real debtor/administration-facing action, even though a `CommunicationExecution`/send pipeline already exists in the schema from earlier phases.
**Why:** Proving documentary extraction/entity-resolution quality on real data is a smaller, safer, independently valuable step than also proving outbound communication safety at the same time. Bundling them raises the stakes of Phase 8 for no proportional learning benefit.
**Status:** active. See [ROADMAP.md](ROADMAP.md) (Phase 13 is where this gate reopens) and [SECURITY.md](SECURITY.md).

## Developer OS / handoff workflow

**Decision:** `docs/agent-handoffs/CURRENT_HANDOFF.md` stays the untracked, continuously-updated "what just happened / what's next" record. `knowledge/*.md` is a tracked, durable-truth index that links into the existing `RECOVERIA-*.md`/`docs/RECOVERIA-PHASE-*.md` history rather than duplicating it. `AGENTS.md` is the short operational entrypoint every agent reads first; `CLAUDE.md` adds Claude-specific working notes on top of it.
**Why:** Without this split, every new agent either re-reads the entire chat history (expensive, lossy) or re-derives facts already settled in old docs (slow, error-prone). The split keeps "what's true right now" small and current while preserving the full historical record for when detail is actually needed.
**Status:** active, established this turn.

## One writable task owner per bounded surface

**Decision:** No two agents (human-run, Claude, or otherwise) write to the same code/infrastructure surface concurrently.
**Why:** Concurrent writes to shared infra (Cloud Run revisions, IAM bindings, migrations) are exactly the kind of hard-to-reverse, hard-to-diagnose conflict this project's founder-gated workflow exists to prevent.
**Status:** active, encoded in `AGENTS.md`/`CLAUDE.md`.

## Human gates for sensitive external mutations

**Decision:** Production deployment, Client Zero access, real Drive execution, Catedral access, real collections communication, OAuth/IAM/secrets mutation, destructive migrations, legal actions, ConcilIA access, and `recoveria-gestion` modification all require explicit, current-turn founder authorization — not inferred from a prior adjacent authorization.
**Why:** This is the pattern that successfully caught and safely resolved two real infrastructure bugs during Phase 7C (a missing IAM grant, a header-parsing bug) without ever touching real data or taking an irreversible action prematurely.
**Status:** active, encoded in `AGENTS.md`.

## Original Phase 0-10 plan superseded by actual build order

**Decision:** `RECOVERIA-PHASE-PLAN.md`'s original numbering is historical context, not the current roadmap. [ROADMAP.md](ROADMAP.md) is the current sequence.
**Why:** Actual implementation (Phases 4.6-4.7, 5A-5B, 6A-6B, 7B-7C) diverged from the original plan's numbering early, and the product direction itself has now pivoted from "grow the synthetic domain model" to "prove real-data quality on a narrow read-only slice first."
**Status:** active, this turn.
