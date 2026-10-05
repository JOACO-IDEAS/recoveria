# Local setup

This guide is the canonical path for a new technical owner. It intentionally requires no production, staging, Google, email, or Client Zero credential.

## Prerequisites

- Node.js 20 LTS or newer.
- npm, using the committed root `package-lock.json`.
- PostgreSQL only when exercising persistence or migrations locally.
- Optional: pnpm 11 and Node 22.13+ for the separate `apps/web` surface; follow its own `package.json` and lockfile.

## Install

```bash
git clone <private-repository-url>
cd recoveria
npm ci
npm run db:generate
```

Do not copy `.env` files from another machine. Start from the tracked contract:

```bash
cp .env.example .env
```

The root UI and unit tests are designed to be understandable with synthetic data. Leave cloud, Client Zero, outbound communication, and provider variables blank unless a separately authorized task requires them.

## Local environment

`.env.example` groups variables by boundary: local required/optional, browser-safe, synthetic-staging server-only, Client Zero server-only/gated, and specialized operator-script values. Only names and safe placeholders belong in the example. Real values live in approved local secret files or the external platform secret manager; they are never committed.

## Database and migrations

Most UI work and the default test suite do not require a live database. For local persistence work, create a disposable local PostgreSQL database and set the local URL documented in `.env.example`.

```bash
npm run db:generate
npm run db:validate
```

Migrations are additive historical records in `prisma/migrations/`. Do not run `prisma migrate deploy` against staging, Client Zero, or any external database without explicit founder approval and a reviewed rollback plan. Never point local tests at a non-disposable database.

## Run the root app

```bash
npm run dev
```

Open `http://localhost:3000`. The root surface is not the same process as the separately deployed `apps/web` BFF.

## Required validation

```bash
npm run lint
npm run typecheck
npm test
npm run db:generate
npm run db:validate
npm run build
npm run client-zero:preflight
git diff --check
```

`npm run check` runs the normal application checks together. The Client Zero environment preflight is not a normal local-development command; do not point it at real secrets merely for ceremony.

## Separate `apps/web` surface

`apps/web` is the synthetic staging web/BFF surface. It has a separate pnpm lockfile and runtime contract. Work there only when the task explicitly includes it:

```bash
cd apps/web
pnpm install --frozen-lockfile
pnpm run lint
pnpm run build
```

Do not link or deploy a Vercel project as part of local setup.

## Troubleshooting

- Prisma client missing: run `npm run db:generate`.
- Database errors during ordinary UI work: confirm `.env` contains only the safe local contract, remove server-only staging/Client Zero settings, and use local synthetic mode.
- Environment-boundary rejection: do not weaken it; check for mixed local, staging, and Client Zero identifiers.
- Next.js API uncertainty: follow `AGENTS.md` and the installed docs under `node_modules/next/dist/docs/`.
- Client Zero preflight failure: treat it as a security failure; do not bypass or commit.
- A command appears to need real Drive, email, cloud, or customer access: stop. It is not normal setup.
