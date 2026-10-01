# Phase 7B — online synthetic staging foundation

The approved Product Surface is now first-class source under `apps/web`. Browser API calls use the same origin. Local development may use an explicitly selected local adapter; staging cannot use loopback or filesystem preview configuration.

The runtime separates LOCAL, STAGING_SYNTHETIC, and reserved PRODUCTION_CLIENT_ZERO. Only the first two are implemented. Staging validates the exact synthetic organization, connection, Google project, `recoveria_pilot` database name, Drive read-only scope, task queue, founder allowlist, and Cloud Run audience, and rejects Client Zero/production markers.

Founder sessions are encrypted and authenticated, one hour, HttpOnly, Secure, SameSite Strict, tenant/actor/email-bound, CSRF-protected, durably revocable, and allowlist-only. The Cloud API remains authoritative for session and membership checks. Folder candidates are opaque, durable, tenant/actor/session-bound, expiring, atomically consumed, and never expose the raw root reference.

Sync Now claims the existing durable intent before deterministic task creation. Cloud Tasks is only delivery; duplicate dispatch or delivery resolves to the same logical execution. Provider preview resolves a committed tenant document server-side, verifies root membership, MIME, 25 MB limit, PDF structure, checksum and provider identity, then streams private/no-store bytes.

No Drive operation, migration application, external provisioning, deployment, or production alias change occurred in Phase 7B.
