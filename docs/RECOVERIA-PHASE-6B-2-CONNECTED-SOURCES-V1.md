# RecoverIA Phase 6B.2 — Connected Sources V1 (offline)

## Scope and safety

This phase is an offline implementation. It made zero Google Drive/provider requests, did not refresh credentials, did not access Client Zero, did not deploy, and did not add automatic synchronization. The Product Surface flow is locally simulated with fakes; the real provider boundary remains disabled.

## Persistence

`ConnectedSource` is additive and tenant-scoped. It owns the product identity, provider connection reference, confirmed provider root, safe display name, confirmation actor/time, root-boundary version, product health, last attempted/successful sync, committed document/review counts, and optimistic revision. OAuth lifecycle remains authoritative in `DriveConnectionState`; connection state is derived rather than duplicated.

The Google folder ID is sensitive configuration metadata but is neither a bearer credential nor document content. Application-level encryption would prevent indexed/operational use without materially reducing the primary threat once the application can decrypt it. V1 therefore stores it as server-only database configuration protected by database encryption/access controls. It is excluded from logs, URLs, normal DTOs, and browser state after candidate confirmation. Browser operations use `connectedSourceId`; the Picker-selected ID exists only as untrusted, short-lived candidate input. Reassess field-level encryption before production if infrastructure or threat-model requirements change.

The migration creates two enums, one table, indexes, and an organization foreign key. It contains no `DROP`, `TRUNCATE`, `DELETE`, table rewrite, or modification of Drive pilot rows. It was inspected but not applied to any real database.

## P2 closure

P2-1: all composed Drive transports must implement the runtime retry declaration. `RETRY_CAPABLE` and undeclared transports are rejected before a provider request. The orchestrator remains the sole retry owner. Tests cover the exact maximum retry count and single-attempt terminal authorization/root failures.

P2-2: the checkpoint CAS remains before terminal success. Once checkpoint commit returns, deadline cancellation is no longer allowed to relabel the run. Terminal success persistence is attempted three times; if its store remains unavailable, the execution stays non-terminal and raises `PILOT_TERMINAL_STATE_RECONCILIATION_REQUIRED`. It is never rewritten as failed/aborted after trusted source truth advanced. A future operational reconciler may finish that success from the committed checkpoint, but V1 never reports a false failure.

## Product service and security

`ConnectedSourceService` resolves provider connection and confirmed root internally from `{organizationId, connectedSourceId, actor}`. Raw root IDs are not accepted by Sync Now. Concurrent in-process commands share one active promise, while the durable execution repository remains the cross-instance uniqueness authority. Product commands validate tenant identity and a session-bound CSRF token. RecoverIA still lacks production-ready login/session issuance; the bounded `ProductActor` abstraction is sufficient for offline flow but real session cookies, authorization policy, CSRF issuance/rotation, and callback-to-session correlation are deployment gates.

Folder confirmation uses: Picker selection → untrusted folder ID → server metadata validation with the connected account → opaque candidate ID plus safe display name → explicit confirmation → durable root binding. Changing folder increments `rootBoundaryVersion`, clears committed current-source counts, preserves historical evidence, and requires a fresh scan. Disconnect removes the active root from the product connection and prevents sync while preserving counts/history; provider revocation and local credential destruction remain a separately executed partial-failure workflow. Reconnect requires fresh OAuth and root confirmation.

## Google Picker findings (verified 2026-09-30)

Official Google documentation requires the Google Picker API and Drive API, a browser API key, OAuth web client, Cloud project-number App ID, authorized JavaScript origins, and a short-lived OAuth access token. The API key should be website-restricted to the RecoverIA origin plus `https://docs.google.com/*`, and API-restricted to Picker/Drive. A `DocsView` supports `setIncludeFolders(true)` and `setSelectFolderEnabled(true)`; Shared Drives remain disabled. `drive.readonly` remains supported and no broader scope is required.

The access token may exist only in component memory for the Picker session; it must not enter local/session storage, logs, URLs, analytics, or durable client state. Refresh credentials never reach the browser. The server revalidates the selected folder and remains authoritative.

References: [Picker web prerequisites](https://developers.google.com/workspace/drive/picker/guides/web-picker-sample), [Picker web integration](https://developers.google.com/workspace/drive/picker/guides/web-picker), [DocsView folder selection](https://developers.google.com/workspace/drive/picker/reference/picker.docsview), [Drive scope classification](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

Because `drive.readonly` is restricted and RecoverIA stores/transmits its data server-side, public production requires Google restricted-scope verification and the applicable security assessment. No configuration was changed in 6B.2.

## Progress and documentary value

Connection and sync states remain separate. Product progress exposes only durable/observable milestones: preparing, discovering, documents found, analyzing with a count only when backed by execution counters, finalizing, succeeded, succeeded with review, or failed. Provider-request counts are excluded.

First value includes documents analyzed, unique documents, exact/possible duplicates, detected/candidate entities, and review-required count. It never derives outstanding balance, unpaid amount, recovered amount, current debt, collectibility, prescription, or legal status from Drive.

## 6B.3 exact real-flow validation plan

1. Provision/restrict the Picker API key and authorized JavaScript origins; confirm Drive and Picker APIs only.
2. Apply the inspected migration to the isolated `recoveria_pilot` database after a fresh fail-closed target check; verify status and empty Connected Source state.
3. Wire a real authenticated founder-only session and CSRF boundary in the isolated runtime; no public anonymous command endpoints.
4. Create one Connected Source bound to the existing synthetic connection without changing its current root or credential.
5. Issue one bounded short-lived Picker access token; confirm it is memory-only and that refresh credentials remain server-only.
6. Select the already-approved synthetic folder through Picker, revalidate metadata server-side, and compare the candidate to the currently authorized synthetic root without logging either ID.
7. Confirm the candidate once and verify the durable product record using sanitized metadata only.
8. Run exactly one founder-authorized first/manual sync only after P2 deployment regression and execution-ledger preflight; cap the corpus and requests at approved limits.
9. Observe sanitized progress, terminal/checkpoint consistency, and first-value summary; verify the same 40 synthetic records reach Facturas/Evidence Inspector.
10. Exercise one unchanged Sync Now and prove incremental reuse/no duplicate execution. Do not test a changed document unless separately authorized.
11. Validate responsive Sources/Facturas UX and secret/log boundaries.
12. Stop. Do not enable scheduler, notifications, Client Zero, public deployment, or Agent.
