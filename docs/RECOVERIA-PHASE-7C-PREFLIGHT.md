# Phase 7C preflight — blocked before deployment

The isolated `recoveria_pilot` target was verified without exposing connection details. Migration `20260930234500_staging_foundation` was inspected as additive and applied successfully. Post-migration verification preserved checkpoint version 5, 40 committed synthetic documents, 40/40 provider content identities, one OAuth lifecycle row, one encrypted credential envelope, seven historical Drive executions, and two historical sync intents.

A non-sensitive callback sentinel received the expected rejected response and was not retained in the `_Default` Cloud Logging bucket. No OAuth authorization, token exchange, or Drive request occurred.

Deployment stopped before creation of Vercel, Cloud Run, Cloud Tasks, IAM, or OAuth resources. The Git-backed BFF currently forwards the Vercel OIDC token directly, while Google Cloud requires STS federation and service-account impersonation before a Cloud Run audience-bound identity token can be generated. The current Product API composition also retains pilot-era automatic in-memory founder sessions, a fixed actor, and an in-memory folder-candidate repository. Vercel deployment protection alone does not provide a documented application-visible founder identity suitable for the approved email allowlist and encrypted application session.

Deploying the current state would therefore fail the Phase 7C founder-auth, revocation, tenant-binding, and service-identity requirements. A bounded Phase 7C.0 correction must implement and test the founder identity handshake, durable application session wiring, durable candidate composition, Vercel OIDC → Google STS → service-account impersonation → Cloud Run ID-token exchange, and fail-closed API enforcement before provisioning resumes.

No corpus sync, Drive content read, Drive mutation, deployment, alias change, or Client Zero access occurred.

## Phase 7C.0 offline correction

The application boundary now uses Google-signed ID tokens for the single founder identity. A verified Google issuer/audience/signature and `email_verified` claim are mapped through a server-owned email allowlist, then through an active RecoverIA tenant membership, before a durable encrypted session is issued. Actor and organization identifiers are never accepted from the browser. Session lookup, membership validation, expiry, CSRF, revocation and logout fail closed; calling the session endpoint anonymously returns `401` and never creates a session.

The Vercel BFF now consumes the request-scoped `x-vercel-oidc-token`, validates the exact issuer, external audience and subject, exchanges it at Google STS, impersonates the dedicated service account, and sends only the resulting short-lived, Cloud Run audience-bound Google ID token upstream. Federated and ID tokens remain memory-only. Raw Vercel assertions, long-lived service-account keys and shared bearer secrets are prohibited.

The staging Connected Sources composition uses `PrismaFolderCandidateRepository`; process-memory candidates remain test/local-only. Product reads, invoice detail, evidence and PDF preview use the authoritative durable session and active membership, with tenant equality checked against the resolved Product Surface scope.

### Route authorization matrix

| Capability | Public | Session + tenant | CSRF | Provider condition |
|---|---:|---:|---:|---|
| Founder login | yes | created only after verified identity + membership | identity assertion | exact Google issuer/client |
| Session, Inicio, Sources, status, Facturas/detail/evidence/preview | no | required | no | preview additionally requires committed document |
| OAuth start, Picker | no | required | mutation only | connected Drive credential/scope |
| Folder candidate, confirm, Sync Now | no | required | required | exact source/root binding |
| OAuth callback | yes | state-bound | no | environment/tenant/operator/connection/callback, expiry and one-time consumption |
| Logout | no | required | required | durable revocation |

### External provisioning required to resume Phase 7C

Google Cloud must create one Workload Identity Pool and one OIDC provider whose issuer is the exact Vercel team issuer. Map `google.subject=assertion.sub`, plus the narrow team/project/environment claims used by the condition. The attribute condition must match the one staging Vercel team, project and environment. Grant `roles/iam.workloadIdentityUser` only to that principal set on the dedicated staging runtime service account, and grant that service account only `roles/run.invoker` on the private Product API. No service-account key is permitted.

Vercel must expose its request-scoped OIDC assertion and configure the exact issuer, external audience, subject, WIF provider resource, service-account email, private Cloud Run URL/audience, synthetic database reference, session key reference and founder-auth client ID. The public origin must be registered as an authorized Google Identity Services JavaScript origin. The sole founder email and its server-side actor/organization mapping must be configured without browser-overridable values. Secret values are not recorded here.
