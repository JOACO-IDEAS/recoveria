# Recoveria synthetic staging foundation

These definitions are inert deployment inputs for Phase 7C. They do not provision resources.

- Web root: `apps/web`; proposed hostname: `staging-recoveria.vercel.app` (do not move `recoveria-gestion.vercel.app`).
- Product API: authenticated Cloud Run service; only the Vercel workload identity and operator break-glass identity receive invoker.
- Worker: private Cloud Run service; only the Cloud Tasks OIDC service account receives invoker.
- OAuth callback: separate narrowly public Cloud Run service; all non-callback routes fail closed.
- Database: `recoveria_pilot`, synthetic only. Apply `20260930234500_staging_foundation` only in Phase 7C after review.
- Drive scope remains exactly `https://www.googleapis.com/auth/drive.readonly`.

Required Vercel variable names: `RECOVERIA_ENVIRONMENT`, `RECOVERIA_STAGING_API_URL`, `RECOVERIA_STAGING_API_AUDIENCE`, `RECOVERIA_SESSION_KEY`, `RECOVERIA_FOUNDER_EMAILS`, and platform-managed `VERCEL_OIDC_TOKEN`. The BFF must not receive Drive credentials, root IDs, database credentials, or KMS decrypt authority.

Required Cloud Run secret references: database URL, OAuth client secret, session key, credential-envelope KMS key reference. Values are never placed in these files.

Phase 7C must configure Workload Identity Federation so Vercel obtains short-lived Google identity tokens with the Product API as exact audience; no shared long-lived bearer is permitted.
