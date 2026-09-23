# RecoverIA Phase 4.6B.5B-B2-C1 — Synthetic infrastructure foundation

## Status

Completed on 2026-09-23. The isolated synthetic infrastructure foundation exists and remains application-inactive.

The Google Cloud project, keyless runtime identity, billing association, monthly alert budget, independent Neon project, default branch, and empty pilot database are provisioned. No OAuth, Drive access, migration, application connection, Cloud Run deployment, KMS key, Secret Manager secret, or Client Zero resource exists.

## Purpose and environment

- Environment: `synthetic-pilot`
- Purpose: isolated infrastructure foundation for the future synthetic RecoverIA Google Drive pilot
- Canonical Google Cloud region: `southamerica-east1` (São Paulo, Brazil)
- Neon synthetic-pilot exception: `aws-us-east-1`

**NEON REGION EXCEPTION IS SYNTHETIC-PILOT-ONLY. REGION/DATA-RESIDENCY MUST BE REASSESSED BEFORE CLIENT ZERO.**

## Current inventory

### Google Cloud

- Project display name: `Recoveria Synthetic Pilot`
- Project ID: `recoveria-pilot`
- Project number: `27126432407`
- Lifecycle: `ACTIVE`
- Authentication: active; no default project selected
- Matching pre-existing RecoverIA pilot projects: zero
- Billing association: attached and enabled; billing identifier intentionally omitted
- APIs explicitly enabled by B2-C1: Cloud Billing Budget API
- Provider-default APIs: the standard Google-created project baseline remains enabled; no Drive, Cloud Run, KMS, or Secret Manager API is enabled
- Runtime service account: `recoveria-pilot-runtime@recoveria-pilot.iam.gserviceaccount.com`
- Service-account user-managed keys: `0`
- Runtime IAM roles: none
- Broad runtime IAM roles: none
- Budget: USD 10 monthly, scoped only to `recoveria-pilot`, with 50%, 80%, and 100% actual-spend alerts; alerting only, not a hard spending cap
- OAuth clients or consent configuration: none
- Cloud Run services: none
- KMS keys: none
- Secret Manager secrets: none
- Drive API or authorization: none

### Neon

- Authentication: active for the founder-selected organization
- Existing projects observed: `recoveria-test` and `neon-erin-bell`; neither was modified or reused
- Organization: `Joaco Projects` (`org-silent-credit-08318564`), independent from the prior Vercel-managed organization
- Project: `recoveria-pilot` (`billowing-scene-99251557`)
- Authorized synthetic-pilot region: `aws-us-east-1`
- Database: `recoveria_pilot`
- Default branch: `main` (`br-sparkling-night-auf6cr87`)
- Credentials: none returned or stored
- Prisma migrations: not applied
- Application/database connections: none

### Local configuration

- Private infrastructure inventory: `.private/synthetic-pilot/resources.json`, ignored and mode `0600`
- Secret material: none created or stored
- Tracked changes: this sanitized document and the synthetic-pilot ignore rule

## Teardown plan

Current teardown consists of:

1. mark Google Cloud project `recoveria-pilot` for deletion and verify its lifecycle state;
2. delete Neon project `billowing-scene-99251557` from the independent `Joaco Projects` organization;
3. remove only `.private/synthetic-pilot/`;
4. update this inventory with sanitized deletion evidence.

## Next gate

B2-C1 is complete. Before any B2-C2 activation, obtain separate authorization and revalidate billing alerts, project ownership, IAM, database target identity, credential handling, and synthetic-only scope. The authorized Neon region for this synthetic pilot is `aws-us-east-1` only.

B2-C2 is not authorized. OAuth, Drive access, migrations, KMS/Secret Manager resources, Cloud Run, application activation, and Client Zero remain prohibited.

## Client Zero

Client Zero is NO-GO and was not accessed.
