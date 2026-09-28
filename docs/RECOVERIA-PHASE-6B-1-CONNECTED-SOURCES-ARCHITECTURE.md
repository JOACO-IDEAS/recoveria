# RecoverIA Phase 6B.1 — Connected Sources product architecture

## Decision

A Connected Source is the product-owned projection over an existing durable provider connection, an explicitly confirmed root, the execution ledger, and the committed source checkpoint. It is not a second OAuth or ingestion state machine. Google Drive is the first provider; later adapters can supply accounting exports, bank evidence, receipts, email, or other sources without weakening their distinct truth authority.

Google Drive supplies documentary truth only: existence, stated identifiers and dates, nominal stated values, candidate entities, provenance, relationships, and duplicates. It does not establish outstanding balance, payment status, reconciled debt, collectibility, prescription, or legal status.

## Existing component disposition

| Component | Disposition | Product role |
| --- | --- | --- |
| Durable OAuth state/callback, exact scope validation | Reuse as-is | Server-side connection authorization |
| Encrypted credential envelope, KMS vault, lifecycle | Reuse as-is | Durable credential and authorization truth |
| `GoogleDriveSource`, `RealGoogleDriveClient` | Reuse as-is | Root-bounded read-only provider adapter |
| `IncrementalCorpusProcessor`, checkpoint | Reuse as-is | Incremental semantics and documentary knowledge |
| Product Surface read model | Reuse as-is | Facturas and Evidence Inspector projection |
| Root binding and pilot composition | Reuse with product wrapper | Replace configuration input with confirmed durable source root |
| Execution ledger and limits | Reuse with product wrapper | Product operation, health, and truthful progress |
| Operator CLI, activation gate, fixed pilot identity | Pilot-only / replace | Product-authenticated commands and tenant context |
| One-shot orchestrator | Refactor before product use | Preserve safety but remove founder-only naming and close the two P2 items |

## Customer flow

1. In onboarding or **Configuración → Fuentes**, the authenticated user chooses **Connect Google Drive**.
2. The server creates one durable OAuth state bound to organization, operator, connection, and exact callback. Google consent requests only `drive.readonly`; callback validation, KMS encryption, and lifecycle transition remain unchanged.
3. After `CONNECTED`, RecoverIA launches Google Picker in folder-only, My Drive mode. Picker may receive a short-lived access token in its browser SDK as required by Google, but never a refresh token. The selected ID is treated as untrusted input.
4. The server revalidates the selected item with the connected credential: it exists, is a folder, belongs to the authorized account/My Drive scope, is not trashed or a shortcut, and is accessible. The UI shows only its display name and asks the user to confirm.
5. Confirmation atomically establishes the durable root binding and audit metadata. The raw provider identifier is never pasted by the user and is not exposed in ordinary UI or telemetry.
6. **Connect folder and scan** creates one idempotent execution. Existing limits, download audit, provider client, understanding pipeline, checkpoint, and Product Surface projection are reused.
7. The result shows documentary first value and links to Facturas. The source remains connected for later manual or automatic sync.

Google documents Picker as its web selection UI and says it can use `drive.readonly`; it also documents `drive.readonly` as read/download access to all Drive files and a restricted scope. RecoverIA therefore preserves the already-audited scope for root browsing plus ongoing read/download, while retaining the independent root boundary. References: [Picker overview](https://developers.google.com/workspace/drive/picker/guides/overview), [web Picker](https://developers.google.com/workspace/drive/picker/guides/web-picker), [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

## Product lifecycle and progress

Product connection status is derived from durable lifecycle plus root presence: not connected, authorizing, connected without folder, ready, reauthorization required, or disconnected. Sync status is separately derived from the execution ledger: never run, queued, discovering, analyzing, finalizing, completed, completed with review, or failed. These are projections, not independently writable state machines.

Current truthful progress is milestone-based. `discoveredCount` supports “40 documents found”; `downloadedCount / discoveredCount` supports bounded analysis progress only while downloads correspond to analysis input; terminal execution plus the sanitized corpus report supports completion/review. Provider-request counts stay operational. If analysis later becomes independently queued, a durable processed count is required before claiming exact “18 / 40” analysis progress.

First value may report documents analyzed, unique documents, exact/possible duplicates, detected entity clusters, and review-required items. It must not report outstanding money or payment state.

## Sources control plane

Each card shows provider, connection health, selected folder display name, committed document/review counts, last attempted sync, last successful sync, and sync health. Actions are **Sync now**, **Change folder**, and **Disconnect**. A future Catedral card can independently advertise accounting truth.

`Sync now` is an authenticated, CSRF-protected, idempotent server command. It validates lifecycle/root/limits, claims one execution, uses the last committed checkpoint, and exposes sanitized status. Concurrent requests return the active execution rather than launching duplicates.

Changing folder requires a new Picker selection and explicit confirmation. It creates a new root/checkpoint boundary; old documentary evidence remains historical and is not silently reassigned or deleted. Disconnect revokes or destroys credentials through an explicit partial-failure-aware workflow, prevents new provider access, preserves provenance and historical evidence, and marks health disconnected. Reconnect creates fresh authorization and requires root re-confirmation; it never revives an old root implicitly.

## Continuous sync recommendation

Stage 1: connection, confirmed folder, first scan, and manual **Sync now**. Stage 2: scheduled polling using the existing change cursor, with lease/idempotency and P2 closure. Stage 3: optional Google change notifications as a wake-up hint, followed by the same authoritative incremental scan. The recommended end state is hybrid: notifications reduce latency, scheduled polling repairs missed notifications, and manual sync remains available. No scheduler or webhook is introduced in 6B.1.

Unchanged reuse, content change, processing-version change, locator rename, same bytes/new source identity, transient fetch retention, and authoritative removal all remain owned by `IncrementalCorpusProcessor`. Removal means absent from the active source projection while historical evidence/provenance remains; it does not delete accounting records or assert payment state.

## Persistence gap — migration separately gated

Current tables are insufficient for a product Connected Source. `DriveConnectionState` lacks provider-neutral identity and product metadata; the root exists only in pilot execution/configuration; attempts and successful sync timestamps cannot be reconstructed reliably from one projection; display name and explicit confirmation are absent.

The minimum future additive design is:

- `ConnectedSource`: organization, stable source/connection identity, provider, lifecycle projection, selected-root encrypted/opaque reference, safe root display name, root confirmation actor/time, last attempted/successful sync, committed document/review counts, health, revision, timestamps.
- Rename/generalize or wrap `DrivePilotExecution` as `SourceSyncExecution`, retaining immutable provider execution identity, root snapshot, status, truthful counters, failure classification, idempotency key, and timestamps.
- Keep `DriveSourceCheckpoint` as the checkpoint payload initially; later generalize its name without changing semantics.

No Prisma change or migration occurs in 6B.1. Before persisting, decide whether provider root identifiers require application-level encryption; they must at minimum be excluded from normal client DTOs, URLs, and logs.

## 6B.2 bounded scope

1. Approve and migrate the additive Connected Source persistence model.
2. Add tenant-authenticated product APIs for source listing, OAuth initiation/callback result, folder selection confirmation, first scan/manual sync, and sanitized execution polling.
3. Add a folder-only My Drive Picker UI with server revalidation and explicit confirmation.
4. Adapt the existing pilot composition behind a provider-neutral sync service; do not rebuild OAuth, credentials, Drive client, checkpoint, or incremental processing.
5. Implement onboarding/Sources/first-scan/first-value UI and a small Facturas source-health indicator.
6. Close P2-1 retry composition and P2-2 checkpoint/terminal timing before any next real Drive execution.
7. Validate offline with fakes. Real provider execution, scheduled sync, Shared Drives, deployment, and Agent remain separately gated.

Blockers are schema approval/migration authorization, authenticated session/CSRF boundary for product commands, Picker API/app configuration review, root-reference storage decision, complete disconnect partial-failure semantics, and both P2 closures.
