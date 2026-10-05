# Recoveria

Recoveria is an intelligent accounts-receivable and collections operating layer. It assembles documentary and, eventually, accounting evidence into traceable work: what exists, what is known, what is uncertain, what needs review, and what action a person may consider next.

It is not merely a CRM, an invoice-OCR tool, an ERP, a generic chatbot, or legal automation.

```text
documents → invoices → entities → balances/evidence → cases → priorities → actions
```

The long-term product principle is simple: Recoveria should operate routine work for the user and ask for help only on genuine exceptions. Human authority, provenance, and uncertainty remain structural requirements.

## Current status

Currently implemented:

- A modular Next.js/TypeScript application with Prisma/PostgreSQL persistence.
- Deterministic document understanding, provenance, reviewable entity resolution, prioritization, case, and communication-preparation modules.
- A synthetic Product Surface and Evidence Inspector.
- A proven synthetic staging topology using a Vercel BFF, private Cloud Run services, Cloud Tasks, OIDC/WIF, and Neon/Postgres.
- A private, local-only Client Zero review workflow whose code is tracked but whose source documents and review artifacts are intentionally absent from Git.

Currently validated:

- The synthetic staging asynchronous chain has run end to end without invoking the Drive provider.
- A narrowly authorized 20-document Client Zero canary and an independent verification layer were completed under prior, scoped approval. Only aggregate, sanitized conclusions are committed.
- The normal repository lint, typecheck, test, Prisma, build, and Client Zero Git-boundary checks pass at this handoff point.

Planned / north star:

- Complete founder ground-truth review and measure quality before scaling real-document work.
- Add accounting truth through a separately authorized source before presenting real balances or payment status.
- Progress from read-only evidence and review toward carefully gated human-approved actions. Existing send-related code does not authorize real communications.

See [current state](knowledge/CURRENT_STATE.md), [roadmap](knowledge/ROADMAP.md), and the [technical handoff](docs/TECHNICAL_HANDOFF.md) for the precise boundary.

## Stack

- Node.js 20+ and npm for the root application
- Next.js 16, React 19, TypeScript
- Prisma and PostgreSQL
- Vitest and ESLint
- A separate `apps/web` Vercel/BFF surface with its own pnpm contract
- Cloud Run, Cloud Tasks, Vercel, Neon/Postgres, Google OAuth/Drive, KMS/Secret Manager, and an email provider in explicitly bounded environments

## Repository map

```text
src/app/                 Root Next.js product/API surface
src/modules/             Vertical product and infrastructure modules
prisma/                  Schema and additive migrations
apps/web/                Separate staging web/BFF surface
scripts/                 Local, staging, ingestion, and gated operator entrypoints
deploy/                  Cloud Run container/build definitions
infra/staging/           Inert staging definitions and notes
knowledge/               Canonical current product/architecture/security truth
docs/                    Historical phase records plus setup/deployment/handoff guides
tasks/                   Short current backlog
```

Root `RECOVERIA-*.md` and `docs/RECOVERIA-PHASE-*.md` files are historical design and implementation records. They remain useful, but `knowledge/` and `docs/TECHNICAL_HANDOFF.md` are the current entrypoints.

## Quickstart

```bash
npm ci
cp .env.example .env
npm run db:generate
npm run dev
```

The default local UI and most tests use synthetic data. A production credential is not required to understand or validate the repository. Do not enable Client Zero, Drive, email, or staging execution merely to run locally.

Full instructions: [docs/SETUP.md](docs/SETUP.md).

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run db:generate
npm run db:validate
npm run build
npm run client-zero:preflight
```

`npm run check` runs lint, typecheck, tests, and the root production build.

## Environment and deployment

- Copy `.env.example` only as a safe variable-name contract; never copy a founder or cloud `.env` file.
- Local development is synthetic by default.
- Staging is synthetic and must stay isolated from Client Zero.
- Client Zero is read-only and founder-gated; private source material is never in Git.
- Broad production does not exist.

See [docs/SETUP.md](docs/SETUP.md), [.env.example](.env.example), and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Security

Never commit credentials, database URLs, OAuth material, customer documents, ground-truth files, exports, screenshots, or anything under `.private/`. Do not access or operate Client Zero, Drive, Catedral, deployed infrastructure, outbound communications, migrations, IAM, OAuth, or secrets without explicit current authorization.

Start with [SECURITY.md](SECURITY.md) and [knowledge/SECURITY.md](knowledge/SECURITY.md).

## Developer OS

Humans and coding agents must read [AGENTS.md](AGENTS.md). Claude Code also reads [CLAUDE.md](CLAUDE.md). The canonical collaborator snapshot is [docs/TECHNICAL_HANDOFF.md](docs/TECHNICAL_HANDOFF.md); a local untracked `docs/agent-handoffs/CURRENT_HANDOFF.md`, when present, is session history and may contain operational detail not suitable for GitHub.
