# Phase 7C.1 runtime deployment contract

Phase 7C.1 supplies code and reproducible artifacts only. It does not deploy, call Google STS, enqueue Cloud Tasks, access Drive, or mutate external infrastructure.

## Existing external dependencies

The resumed deployment reuses the existing `recoveria-vercel-staging` pool, `vercel-staging` provider, `recoveria-staging-bff`, `recoveria-staging-api`, `recoveria-staging-worker`, and `recoveria-staging-tasks` service accounts, plus the empty `staging-recoveria` Vercel project. They must not be recreated.

## Product API

- Artifact: `deploy/Dockerfile.product-api`
- Cloud Build: `deploy/cloudbuild.product-api.yaml`
- Local build: `npm run staging:build:product-api`
- Startup: `npm run staging:product-api`
- Port: required `PORT`, bound to `0.0.0.0`
- Health: `GET /api/health`
- Runtime identity: `recoveria-staging-api`
- Audience: exact private Cloud Run service URL

Startup validates `STAGING_SYNTHETIC`, the isolated project/organization/connection, exact `recoveria_pilot` database, durable Prisma session/candidate configuration, provider preview, Cloud Tasks configuration, and identical Product/Connected Source database bindings. Local-file preview configuration is rejected.

Required protected references include the database URL, session key, OAuth client secret Secret Manager version, KMS key version, approved synthetic root, Picker API configuration, founder email/actor mapping, Google Identity client ID, task queue/location, task service account, worker URL/audience, and the existing WIF/Cloud Run bindings. Secret values are never tracked.

## Worker

- Artifact: `deploy/Dockerfile.worker`
- Cloud Build: `deploy/cloudbuild.worker.yaml`
- Local build: `npm run staging:build:worker`
- Startup: `npm run staging:worker`
- Port: required `PORT`, bound to `0.0.0.0`
- Health: `GET /health`
- Delivery: `POST /internal/tasks/sync`
- Runtime identity: `recoveria-staging-worker`
- Invoker/audience: only `recoveria-staging-tasks` and the exact private worker URL

Cloud Run IAM authenticates the Google-signed task identity first. The application then binds the Cloud Tasks task-name header to the bounded payload and durable task record. No static task secret exists. The worker exposes no Product Surface route.

## Async Sync Now

In `STAGING_SYNTHETIC`, the Product API validates founder session, membership and CSRF, claims one durable intent, creates/reuses one deterministic durable task and returns `202` without executing Drive. Cloud Tasks is at-least-once transport; database intent/task/execution state remains authoritative. Pending dispatch is safe to repeat, provider task-name conflict is treated as idempotent, terminal delivery is reused, and a RUNNING task can be reclaimed only after a ten-minute lease (twice the bounded provider execution duration).

## Founder login and Vercel

`apps/web` is wrapped by a Google Identity Services gate. Anonymous and session-check loading states never render the workspace. The browser submits only the Google credential to the same-origin login endpoint; actor and organization remain server-owned. The Google credential is not the Recoveria session. Logout uses CSRF and durable revocation.

Vercel requires `NEXT_PUBLIC_RECOVERIA_GOOGLE_CLIENT_ID` plus protected BFF settings for the exact Vercel issuer/audience/subject, WIF provider, BFF service account, Product API URL and audience. WIF exchange remains server-only.

## Resumed Phase 7C order

Build and publish both images; deploy private worker and Product API with their existing service accounts; create the bounded queue and task delivery binding; grant the existing BFF caller `run.invoker` only on Product API; configure the existing Vercel project; configure the exact GIS origin; then perform the authorized online tests. Do not run Sync Now during deployment validation.
