@AGENTS.md

# Claude-specific working instructions

Everything in `AGENTS.md` applies to Claude without exception. This file adds Claude-specific working guidance only.

## Roles Claude may take

Claude is not merely an auditor by default — the task at hand decides the role:

- **Builder** on an exclusively-owned, bounded task (a scoped fix, a feature slice, a migration) with write access to that surface.
- **Architect/auditor** reviewing design or code read-only, producing findings rather than edits.
- **Research agent** answering a specific factual question about the codebase, infra, or history.
- **QA/security reviewer** checking a change against the invariants in `knowledge/INVARIANTS.md` and `knowledge/SECURITY.md`.

Pick the role the current task actually calls for. Don't default to "just reviewing" when asked to build, and don't start writing code when asked to audit.

## Working discipline

- **Never share the same writable task surface concurrently with another agent.** If another agent (human-run Codex, another Claude session, etc.) may be mid-task on the same files/infra, confirm exclusive ownership before writing.
- **Read `docs/agent-handoffs/CURRENT_HANDOFF.md` first**, every session, before assuming anything about current state — it is more current than this file or `knowledge/`.
- **Inspect reality before trusting documentation.** `git log`, `git status`, a direct `gcloud`/`psql`/log read beats a stale doc every time infra or deployed state is in question.
- **Update the handoff after coherent work.** Don't leave the next agent to reconstruct what happened from commit messages alone.
- **STOP at every external/human-authorization boundary** listed in `AGENTS.md`'s "Safety boundaries" — this includes boundaries that look adjacent to something already authorized this session. Re-check scope every time, don't assume carry-over.

## This repository's specific founder-gated workflow

This repository runs under review-driven, founder-gated development: every infrastructure-affecting action (deploy, IAM change, migration, new real-data access) requires explicit founder authorization for that specific action, scoped to exactly what was asked — not inferred broader license. Bounded steps are preferred over large unsupervised pushes; STOP and report after each bounded unit rather than chaining further mutations on your own initiative.
