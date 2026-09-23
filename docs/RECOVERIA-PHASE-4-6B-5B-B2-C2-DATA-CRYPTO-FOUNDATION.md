# RecoverIA Phase 4.6B.5B-B2-C2 — Synthetic data and crypto foundation

## Status and scope

B2-C2 completed on 2026-09-23 for the isolated `synthetic-pilot` environment. This phase prepared durable database, encryption, and future-secret boundaries only. It did not activate the application or authorize OAuth, Google Drive, Cloud Run, Client Zero, email, or messaging.

The Neon `aws-us-east-1` choice is a synthetic-pilot-only exception. Region and data residency must be reassessed explicitly before Client Zero or production.

## Database target and migrations

- Neon organization: `Joaco Projects` (`org-silent-credit-08318564`)
- Neon project: `recoveria-pilot` (`billowing-scene-99251557`)
- Region: `aws-us-east-1`
- Branch: `main` (`br-sparkling-night-auf6cr87`)
- Database: `recoveria_pilot`
- Provider-issued credential: stored only in the ignored private boundary, mode `0600`
- RecoverIA migrations found: 8
- RecoverIA migrations applied: 8
- Pending migrations: 0
- Final migration: `20260920213000_drive_pilot_runtime`
- Required durable Drive tables verified: 6 of 6
- Application/business rows inserted: none

The migration target was proven from the provider organization/project/branch/database tuple before connection, then reconfirmed from the connected database identity. Migrations were applied with an explicit purpose-specific credential rather than ambient `DATABASE_URL`. The committed migration set was inspected before application; the Drive migration is additive and contains no drop, truncate, delete, or data rewrite.

## Cloud KMS

- Project: `recoveria-pilot`
- Region: `southamerica-east1`
- Keyring: `recoveria-pilot`
- Key: `oauth-refresh-token`
- Purpose: `ENCRYPT_DECRYPT`
- Algorithm: Google symmetric encryption
- Protection level: `SOFTWARE`
- Primary version: `1`, enabled
- Concrete runtime reference: `projects/recoveria-pilot/locations/southamerica-east1/keyRings/recoveria-pilot/cryptoKeys/oauth-refresh-token/cryptoKeyVersions/1`
- Rotation: no explicit rotation period configured; provider default is no automatic rotation
- Imported/HSM material: none

A clearly synthetic sentinel completed a real encrypt/decrypt round trip. Temporary plaintext, ciphertext, and decrypted files were removed immediately afterward.

## Secret Manager

- Container: `projects/recoveria-pilot/secrets/google-oauth-client-secret`
- Replication: user-managed in `southamerica-east1`
- Versions: 0
- Secret material: none

The container matches the future OAuth client-secret role, but no value was fabricated. The existing runtime contract requires a concrete numbered version before activation; creating that version remains an OAuth-phase gate.

## Runtime IAM

Runtime identity: `recoveria-pilot-runtime@recoveria-pilot.iam.gserviceaccount.com`

- `roles/cloudkms.cryptoKeyEncrypterDecrypter` on the single `oauth-refresh-token` crypto key
- `roles/secretmanager.secretAccessor` on the single `google-oauth-client-secret` container
- Project-level runtime roles: none
- User-managed service-account keys: 0
- KMS/Secret Manager administrator roles: none
- Drive roles: none

## What exists

- Isolated migrated Neon database for the synthetic pilot
- Regional SOFTWARE KMS key and enabled primary version
- Empty regional Secret Manager container
- Minimum resource-level runtime IAM bindings
- Ignored private database credential and non-secret resource inventory

## What does not exist

- OAuth consent, client, authorization code, access token, or refresh token
- Secret Manager secret version or OAuth client-secret material
- Google Drive API enablement, authorization, or request
- Cloud Run or Vercel deployment
- Client Zero data or production data
- Service-account private key
- Application data or synthetic invoice ingestion

## Teardown additions

In addition to the B2-C1 teardown plan:

1. delete the `google-oauth-client-secret` container;
2. schedule destruction of KMS key version 1, then remove the crypto key/keyring when provider lifecycle permits;
3. delete the Neon project to remove the migrated synthetic database;
4. remove only `.private/synthetic-pilot/` local material;
5. preserve sanitized deletion evidence.

## Next gate

B2-C3 requires separate founder authorization. Before the first OAuth token, create and review the OAuth client and exact callback, populate a numbered Secret Manager version with the real client secret through an approved non-logging path, and revalidate fixed identity, state/nonce, IAM, audit, and revoke controls. Before the first synthetic Drive request, separately authorize Drive API activation, a synthetic-only root, and the one-shot operator-confirmed execution.

Client Zero remains NO-GO.
