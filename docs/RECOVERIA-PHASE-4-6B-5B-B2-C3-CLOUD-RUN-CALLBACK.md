# RecoverIA Phase 4.6B.5B-B2-C3 — Cloud Run callback foundation

## Status and purpose

B2-C3 completed the minimum production-shaped callback deployment for the isolated `synthetic-pilot` environment. It exposes health and the existing audited callback boundary, with OAuth not configured and Drive disabled. It does not authorize OAuth, create tokens, enable or call Drive, or access Client Zero.

## Deployment architecture

- Google project: `recoveria-pilot`
- Cloud Run service: `recoveria-pilot-runtime`
- Region: `southamerica-east1`
- Revision: `recoveria-pilot-runtime-00007-vxp`
- Runtime identity: `recoveria-pilot-runtime@recoveria-pilot.iam.gserviceaccount.com`
- Minimum instances: 0
- Maximum instances: 1
- Concurrency: 1
- Artifact repository: `projects/recoveria-pilot/locations/southamerica-east1/repositories/recoveria-pilot-runtime`
- Public base URL: `https://recoveria-pilot-runtime-72qfitymsq-rj.a.run.app`

The bounded Node HTTP bootstrap composes the existing durable callback runtime, fixed server-side identity adapter, Prisma persistence repositories, and fail-closed OAuth client. The health database identity probe uses the PostgreSQL driver independently of callback state.

## Public surface

- `GET /health`
- `GET /oauth/google/callback`

The exact future callback URL is `https://recoveria-pilot-runtime-72qfitymsq-rj.a.run.app/oauth/google/callback`. All other paths and methods return sanitized failures. There are no admin, execution, recovery, debug, database, or Drive endpoints.

## Database secret delivery

The Neon credential is stored in the dedicated regional Secret Manager resource `projects/recoveria-pilot/secrets/recoveria-pilot-database-url`, replicated in `southamerica-east1`. Cloud Run receives its numbered version as the `DATABASE_URL` secret environment value. The value is absent from source, tracked environment files, image configuration, and this document.

The runtime service account has `roles/secretmanager.secretAccessor` only on this database secret. The existing OAuth secret remains a distinct resource and contains zero versions.

## IAM and APIs

Runtime resource-level access is limited to:

- `roles/cloudkms.cryptoKeyEncrypterDecrypter` on the single OAuth refresh-token key;
- `roles/secretmanager.secretAccessor` on the OAuth secret container;
- `roles/secretmanager.secretAccessor` on the database credential secret.

The runtime has no project IAM role and zero user-managed service-account keys. No broad administrator, Drive, Owner, Editor, or Viewer role was granted.

Newly enabled for B2-C3: `run.googleapis.com`, `artifactregistry.googleapis.com`, and `cloudbuild.googleapis.com`. Existing required APIs include `cloudkms.googleapis.com` and `secretmanager.googleapis.com`. Google Drive API remains disabled.

## Validation

- HTTPS health: `200`, with sanitized `READY`, OAuth `NOT_READY`, and Drive `DISABLED` status.
- Deployed database identity: exactly `recoveria_pilot`.
- Migrations: 8 applied, 0 pending; none were run from Cloud Run.
- Invalid callback: missing, duplicate, and invalid protocol inputs rejected without echo.
- Wrong method and unknown route: rejected.
- Durable state after probes: 0 OAuth states, 0 credential envelopes, 0 connected lifecycle rows.
- Drive requests: 0.
- Bounded application and deployment logs: no connection string, password, token, authorization header, secret plaintext, KMS plaintext, or stack trace disclosure.

OAuth activation is false, the OAuth provider is not configured, the OAuth secret has zero versions, and the synthetic Drive root is deliberately `NOT_CONFIGURED`. Health does not depend on OAuth activation.

## Resources created

- One Artifact Registry Docker repository
- One dedicated regional database secret and its credential version
- One Cloud Run service
- One resource-level database-secret accessor binding
- The minimum Cloud Run/build APIs listed above

No OAuth consent configuration, OAuth client, OAuth secret version, token, Drive API, Drive request, scheduler, background poller, Vercel deployment, service-account key, KMS resource, or additional Neon resource was created.

## Teardown additions

1. Delete the Cloud Run service `recoveria-pilot-runtime`.
2. Delete images and the dedicated Artifact Registry repository `recoveria-pilot-runtime`.
3. Delete the dedicated `recoveria-pilot-database-url` secret.
4. Remove the database-secret accessor binding from the runtime identity.
5. Disable B2-C3-only APIs only after confirming no retained resource depends on them.

## Next gate

B2-C4 requires separate founder authorization. Before the first OAuth token: configure and review consent, create the OAuth client for the exact callback URL, securely add a numbered OAuth-secret version, and repeat state, nonce, fixed-identity, revocation, and audit validation. Before the first synthetic Drive request: separately authorize Drive API activation, establish a synthetic-only root, and approve the one-shot operator-controlled execution.

Before Client Zero, reassess region and data residency, complete OAuth and Drive adversarial review, validate teardown/revocation, and obtain explicit founder authorization. Client Zero remains NO-GO.
