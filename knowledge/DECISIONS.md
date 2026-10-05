# Decisions

Lightweight ADR-style log. Each entry: decision, why, status. Add new entries at the bottom; don't rewrite history — if a decision is later reversed, add a new entry that supersedes it and say so.

## The synthetic corpus is frozen as a regression/staging fixture

**Decision:** The 40-document synthetic corpus is not grown or evolved further. It exists solely to prove the architecture and catch regressions.
**Why:** Phase 7C's goal was proving the async infrastructure, not growing product fidelity on fake data. Growing it further would be effort spent learning nothing about real invoices.
**Status:** active. See [CURRENT_STATE.md](CURRENT_STATE.md).

## Client Zero is environment-separate from `recoveria_pilot`/`STAGING_SYNTHETIC`

**Decision:** Client Zero uses a separate database/environment configuration, not the staging-synthetic one.
**Why:** Mixing real and synthetic data in one database makes every future query a potential real-data leak risk and makes the synthetic regression fixture unsafe to reset/modify freely.
**Status:** active and implemented at the environment/database boundary in Phase 8A. The database shares an underlying Neon project/endpoint with staging but is a separate database with a dedicated role; stronger project-level separation remains an optional future upgrade.

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

**Decision:** `docs/TECHNICAL_HANDOFF.md` is the tracked, sanitized collaborator snapshot. `docs/agent-handoffs/CURRENT_HANDOFF.md` stays an optional untracked session/operational record. `knowledge/*.md` is the tracked durable-truth index. `AGENTS.md` is the operational entrypoint; `CLAUDE.md` adds Claude-specific notes.
**Why:** A GitHub clone cannot depend on an intentionally untracked file. This split keeps the repository self-contained while allowing detailed local operational notes to remain private.
**Status:** active; supersedes the earlier handoff ordering while preserving the untracked-file convention.

## One writable task owner per bounded surface

**Decision:** No two agents (human-run, Claude, or otherwise) write to the same code/infrastructure surface concurrently.
**Why:** Concurrent writes to shared infra (Cloud Run revisions, IAM bindings, migrations) are exactly the kind of hard-to-reverse, hard-to-diagnose conflict this project's founder-gated workflow exists to prevent.
**Status:** active, encoded in `AGENTS.md`/`CLAUDE.md`.

## Human gates for sensitive external mutations

**Decision:** Production deployment, Client Zero access, real Drive execution, Catedral access, real collections communication, OAuth/IAM/secrets mutation, destructive migrations, legal actions, ConcilIA access, and `recoveria-gestion` modification all require explicit, current-turn founder authorization — not inferred from a prior adjacent authorization.
**Why:** This is the pattern that successfully caught and safely resolved two real infrastructure bugs during Phase 7C (a missing IAM grant, a header-parsing bug) without ever touching real data or taking an irreversible action prematurely.
**Status:** active, encoded in `AGENTS.md`.

## Client Zero reuses the existing GCP project, with Postgres-level database isolation

**Decision:** `CLIENT_ZERO_READ_ONLY` provisioning (Phase 8A) reuses the existing `recoveria-pilot` GCP project and the existing Neon endpoint, rather than creating a new GCP project or new Neon project. Isolation is achieved via a genuinely separate Postgres **database** (`recoveria_client_zero`, not a schema/row flag) with its own dedicated, least-privilege role that cannot query the staging database at all (proven directly: the role gets "relation does not exist" when attempting to read a staging table).
**Why:** No Neon CLI/API key was available in this environment to provision a new Neon project programmatically, and creating a second GCP project would add billing/IAM-root complexity not clearly required by the approved readiness design (which specified "database/project" isolation, not necessarily a new project). A separate Postgres database on the same server is still hard cross-database isolation in Postgres — stronger than a schema split — even though it shares the underlying Neon compute/billing unit with staging.
**Known limitation, flagged for the founder:** this is not as strong as a fully separate Neon project (different compute/region/billing unit). If stronger infrastructure-level isolation is wanted before real data ever enters this environment, provisioning a dedicated Neon project is the upgrade path — not done here because it requires Neon account-level access this session didn't have.
**Status:** active, Phase 8A, this turn.

## CLIENT_ZERO_READ_ONLY replaces the unused PRODUCTION_CLIENT_ZERO placeholder

**Decision:** Renamed the pre-existing (but never wired anywhere else) `PRODUCTION_CLIENT_ZERO` enum value in `src/modules/staging/environment.ts` to `CLIENT_ZERO_READ_ONLY`.
**Why:** Phase 8 is explicitly read-only with no collection actions; a name containing "PRODUCTION" could mislead a future agent or the founder into assuming broader write/production authority than this environment is ever meant to have. Confirmed via grep that the old name had zero other references anywhere in the codebase, so the rename was safe.
**Status:** active, Phase 8A, this turn.

## Dedicated compute for Client Zero is the target, but remains deferred until a separately approved connected-source phase

**Decision:** Client Zero should eventually get its own Cloud Run worker/API and Cloud Tasks queue identities, never sharing `recoveria-staging-worker`/`recoveria-staging-api`/`recoveria-staging-tasks`. But none of that was created in Phase 8A.
**Why:** The authorized 20-document canary was completed through a controlled local/manual path, without a Drive connection or standing ingestion runtime. Creating unused Cloud Run services and a Cloud Tasks queue ahead of an approved connected-source phase would add attack surface without serving the current workflow.
**Status:** active; revisit at the start of Phase 8B, when real ingestion is separately authorized.

## Original Phase 0-10 plan superseded by actual build order

**Decision:** `RECOVERIA-PHASE-PLAN.md`'s original numbering is historical context, not the current roadmap. [ROADMAP.md](ROADMAP.md) is the current sequence.
**Why:** Actual implementation (Phases 4.6-4.7, 5A-5B, 6A-6B, 7B-7C) diverged from the original plan's numbering early, and the product direction itself has now pivoted from "grow the synthetic domain model" to "prove real-data quality on a narrow read-only slice first."
**Status:** active, this turn.
