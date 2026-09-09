# RecoverIA Client Zero Ingestion Runbook

## Future Phase 4.6 procedure

1. Obtain explicit Phase 4.6 authorization and named data-owner approval for 20–50 documents.
2. Run `npm run client-zero:preflight`; stop unless `ok=true`.
3. Snapshot local database/application state and record rollback identifier outside ordinary logs.
4. Confirm no screenshots/telemetry/network integrations; activate mode with all three documented controls.
5. Place only the approved sample in `.private/client-zero/inbox`; do not inspect unrelated folders.
6. Create a safe manifest containing internal ID, checksum, format, route, status, review boolean, duplicate status, and failure reason only.
7. Run local bounded ingestion; use safe IDs/reason codes in logs; clean temp on success/failure.
8. Review only aggregate sanitized counts first. Any content-level review requires separately explicit authorization.
9. Run preflight again, verify temp empty and no screenshots/reports staged.
10. Choose retain or rollback per authorization; exit real-data mode and document only sanitized outcome.

Phase 4.5 performed only the labeled synthetic simulation.
