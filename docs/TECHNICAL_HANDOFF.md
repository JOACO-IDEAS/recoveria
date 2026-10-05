# Technical handoff

This is the tracked, sanitized snapshot for an incoming technical collaborator. Read it after `AGENTS.md` and before making changes.

## What works and is validated

- The root modular application, deterministic document pipeline, evidence/provenance model, reviewable entity resolution, operational prioritization, review flows, and synthetic Product Surface.
- A separate synthetic staging web/BFF and private Product API/worker topology; an end-to-end no-provider asynchronous probe succeeded.
- Local Client Zero canary/review/independent-verification tooling. Its code is tracked; private inputs and outputs are not.
- A scoped 20-document canary completed with aggregate-only committed reporting. Machine agreement is not accuracy; founder labels remain authoritative.
- At this handoff point, lint, typecheck, tests, Prisma generation/validation, build, and the Git-boundary preflight pass.

## Experimental and current work

- Client Zero remains read-only and local/private at the document-review layer.
- The Product Surface read model and canary persistence shape are not connected.
- Founder ground-truth review is the current human task. The next possible engineering step is a separately approved private read-model adapter/persistence step.
- Real accounting truth, broad real-document ingestion, and real customer-facing automation are not implemented/authorized production capabilities.

## Highest-priority next steps

1. Complete founder labels, starting with disagreements and ambiguous observations.
2. Measure quality only against those labels.
3. Decide whether to render the canary privately through the existing Product Surface.
4. Complete the security gate and obtain new authorization before expanding the corpus or adding real Drive/OAuth/compute.

## Do not touch casually

- `.private/client-zero/`, Client Zero database/material, or any customer document.
- Staging/Client Zero databases, migrations, Vercel, Cloud Run, Cloud Tasks, IAM/WIF, OAuth/Drive, KMS/Secret Manager, or email delivery.
- Catedral, ConcilIA, `recoveria-gestion`, or real collections communications.
- Historical evidence records or intentionally preserved failed staging probes.

## Sources of truth

- Current durable truth: `knowledge/`.
- Decisions: `knowledge/DECISIONS.md`.
- Invariants: `knowledge/INVARIANTS.md`.
- Historical reasoning: root `RECOVERIA-*.md` and `docs/RECOVERIA-PHASE-*.md`.
- Setup/deployment: `docs/SETUP.md` and `docs/DEPLOYMENT.md`.

## Access and Git exclusions

GitHub access is enough for normal code work. Operational access to Vercel, Google Cloud, Neon, Google OAuth/Drive, and email must be granted separately and least-privilege; never share founder credentials or `.env` files.

GitHub intentionally excludes real Client Zero source documents/filenames, extracted artifacts, ground truth, verification output, exports, screenshots, secrets, database URLs, OAuth material, local tool state, generated output, backups, database files, and the optional local `docs/agent-handoffs/CURRENT_HANDOFF.md`.

## Development method

Use one writable owner per bounded surface. Inspect code and Git state before trusting prose. Preserve epistemic status, documentary/accounting separation, tenant isolation, append-only evidence, and human authority. Use reviewable commits and run required checks. Stop at every external, real-data, migration, secret, IAM, OAuth, deployment, or outbound-action gate for explicit current authorization.
