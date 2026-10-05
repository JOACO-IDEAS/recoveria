<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# RecoverIA Developer OS — entrypoint for any coding agent

## What RecoverIA is

RecoverIA is an operational receivables/collections layer for property-management companies (administradores de consorcios) in Argentina. It is **not** invoice OCR, not a generic CRM, not a legal-automation bot. The core model is:

```
documents → invoices → entities → balances/evidence → cases → priorities → actions
```

Longer-term: `facturas → cartera → prioridades → conversaciones → seguimiento → promesas → disputas → recupero → revisión legal`.

North star: **"Recoveria sabe qué sabe, de dónde lo sacó y cuándo no está seguro."** Full thesis: [knowledge/PRODUCT.md](knowledge/PRODUCT.md).

## Mandatory reading order

1. [docs/TECHNICAL_HANDOFF.md](docs/TECHNICAL_HANDOFF.md) — tracked, sanitized collaborator snapshot: what works, what is experimental, what is next, and what is intentionally absent from Git.
2. [knowledge/CURRENT_STATE.md](knowledge/CURRENT_STATE.md) — current phase, what's proven online, current milestone.
3. [knowledge/ARCHITECTURE.md](knowledge/ARCHITECTURE.md), [knowledge/INVARIANTS.md](knowledge/INVARIANTS.md), [knowledge/SECURITY.md](knowledge/SECURITY.md), [knowledge/DATA_SOURCES.md](knowledge/DATA_SOURCES.md) — durable rules that outlive any single phase.
4. [knowledge/ROADMAP.md](knowledge/ROADMAP.md) and [tasks/BACKLOG.md](tasks/BACKLOG.md) — what's next and what's explicitly deferred.
5. [knowledge/DECISIONS.md](knowledge/DECISIONS.md) — why things are the way they are, so you don't re-litigate settled calls.
6. If present locally, `docs/agent-handoffs/CURRENT_HANDOFF.md` — untracked operational/session history. It can be more recent, but it is not required for a clean clone and may contain infrastructure detail unsuitable for GitHub.
7. Only then, the detailed root-level `RECOVERIA-*.md` and `docs/RECOVERIA-PHASE-*.md` files for the specific area you're touching — they are the full historical record; `knowledge/` is the distilled, current-truth index into them, not a replacement.

**Inspect reality before trusting documentation.** Run `git log --oneline -5`, `git status`, and read the actual current code/schema for anything you're about to change — documentation (including this Developer OS) can drift from the repository.

## Commands required before declaring PASS

- `npx vitest run` (full suite) — or the narrower focused test file(s) first, then the full suite before declaring done.
- `npx tsc --noEmit`
- `npx eslint .`
- `npm run build` for root Next.js/Product API changes; `apps/web` has its own `npm run build`/`npx tsc --noEmit`/ESLint when touched.
- `node scripts/client-zero-preflight.mjs` — must return `{"ok":true}` before any commit that touches anything near real-data boundaries.
- `git diff --check` — no whitespace errors.
- Worker/Product API artifact changes: confirm against `deploy/Dockerfile.worker` / `deploy/Dockerfile.product-api` what the real deploy path actually runs (currently `tsx` directly, not a bundler) rather than assuming a build step that isn't the real one.

Do not declare a task PASS on partial validation. If a check cannot run (e.g. no code changed), say so explicitly rather than skipping silently.

## Safety boundaries — NEVER without explicit, current-turn founder authorization

- Production deployment of any kind.
- Client Zero access — opening, reading, or processing any real Christophersen Ascensores invoice/content, in `.private/client-zero/` or anywhere else.
- Real Google Drive execution against a real corpus (synthetic-staging Drive sync is a separate, already-authorized surface — don't confuse the two).
- Catedral access.
- Real collections communication (sending anything to a real debtor/administration).
- OAuth/IAM/secrets mutation of any kind, in any environment.
- Destructive migrations (anything that is not additive-only) against any real or staging database.
- Legal actions or anything that could be read as one.
- ConcilIA access or modification — it is a separate, related project; read-only pattern audits of it have been done once and are documented in `RECOVERIA-CONCILIA-PATTERN-AUDIT.md`. Do not touch its code, schema, data, or infrastructure.
- `recoveria-gestion` modification.

**Agents must STOP at these gates and ask**, even if a prior turn in the same session authorized something adjacent. Authorization is scoped to what was explicitly granted, not extended by inference.

## Environment boundaries

- `LOCAL` — your working tree, synthetic fixtures, no real secrets needed.
- `STAGING_SYNTHETIC` — the deployed Vercel + Cloud Run staging stack, synthetic corpus only (40 documents, frozen as a regression fixture — see [knowledge/CURRENT_STATE.md](knowledge/CURRENT_STATE.md)). This is what Phase 7C proved end-to-end.
- `CLIENT_ZERO_READ_ONLY` — provisioned as a separate read-only database/environment boundary. A previously authorized 20-document canary and private review workflow exist, but all source documents and derived private artifacts remain outside Git. No new access, broader corpus, Drive/OAuth connection, public exposure, or outbound action is authorized by that history.
- Future `PRODUCTION` — does not exist yet.

Never let synthetic and real-data state share a database, Drive root, OAuth connection, or log stream. See [knowledge/SECURITY.md](knowledge/SECURITY.md).

## Source-of-truth rules

- `docs/TECHNICAL_HANDOFF.md` is the tracked, sanitized handoff a clean clone can rely on.
- `docs/agent-handoffs/CURRENT_HANDOFF.md`, when present, is untracked session/operational history. Never commit it; never make cloneability depend on it.
- `knowledge/*.md` is the durable, current-truth distillation — update it when a fact that outlives one session's work changes (a phase closes, an architecture decision is made, an invariant is added). Don't let it drift into a second handoff log.
- The root-level `RECOVERIA-*.md` and `docs/RECOVERIA-PHASE-*.md` files are the full historical record of how we got here. Treat them as append-mostly history, not something to rewrite; `knowledge/` links into them rather than duplicating their content.
- When documentation and code disagree, the code (and a direct, current read of infrastructure/database state) wins. Fix the documentation, flag the discrepancy, don't silently trust the doc.

## Git / worktree expectations

- One writable task owner at a time on any given surface — never run two agents with overlapping write scope concurrently.
- Prefer small, coherent, reviewable commits over large mixed ones. Never commit secrets, tokens, database URLs, or any Client Zero content.
- Never push to the remote without explicit, current-turn authorization.
- `docs/agent-handoffs/CURRENT_HANDOFF.md` stays untracked — don't `git add` it.

## Handoff expectations

After a coherent unit of work, update tracked canonical docs when durable truth changes. If the local `docs/agent-handoffs/CURRENT_HANDOFF.md` exists, also update it with session detail, but keep it untracked. A new collaborator must be able to resume from `AGENTS.md`, `docs/TECHNICAL_HANDOFF.md`, and `knowledge/` without founder chat history.

## Human authorization gates

Every item in "Safety boundaries" above is a hard stop. Beyond those, apply judgment: if an action is hard to reverse, affects shared/external state, or you're not confident it was actually authorized for *this* turn (not merely adjacent to something authorized earlier), stop and ask rather than proceeding.
