# RecoverIA B2-C4B.2 — OAuth callback logging boundary

## Forensic boundary map

Cloud Run, not RecoverIA stdout/stderr, produced the leaking entry. Its log ID is `run.googleapis.com/requests`, monitored resource type is `cloud_run_revision`, entry category is managed HTTP request logging, and the query-bearing value is in `httpRequest.requestUrl`. The entry also carries trace identifiers, but the referenced sampled trace was not retained by Cloud Trace. There is no load balancer in this callback path and no additional project sink.

The project has only the Google-created `_Required` and `_Default` sinks. `_Required` is locked, retains mandatory audit categories for 400 days, and neither routes nor contains the Cloud Run request log. `_Default` stores the request log in its global bucket for 30 days. Sink exclusions are evaluated by Log Router before routing to a destination and affect only future entries; they do not stop source generation or remove entries already stored.

Google Cloud does not provide safe entry-level deletion for one stored request. Deleting the whole log or bucket, or reducing unrelated retention, would be broad and is not authorized. The historical callback entry is therefore a restricted security artifact that expires through the existing 30-day `_Default` retention policy. Its authorization code and state are expired, no token exchange occurred, and no credential was obtained.

## Bounded correction under evaluation

The `_Default` sink has one exclusion named `oauth_callback_query_boundary`. It is limited to resource type `cloud_run_revision`, service `recoveria-pilot-runtime`, log ID `run.googleapis.com/requests`, and the OAuth callback route. It does not modify `_Required`, application logs, health request logs, audit logs, IAM, the callback parser, or state handling.

Synthetic callback canaries used unique fake code and state markers and an invalid synthetic durable state, so they could not reach token exchange. Normal health requests were issued alongside each canary to prove unrelated request logging remained available. Every canary, including a final canary after an extended propagation interval, remained stored once in `_Default` and zero times in `_Required`; the associated health request also remained stored as intended. The active exclusion filter matches those callback entries when evaluated as a read query, but did not prevent their durable `_Default` retention. The correction is therefore not effective and the phase remains blocked.

## Security invariants and next gate

The strict callback parser still requires exact Google issuer and read-only Drive scope metadata, rejects unknown and duplicate parameters, and preserves opaque hash-only state, expiry, atomic consumption, replay protection, and fixed server identity. The database remains unchanged by this phase.

The tested narrow exclusion did not produce zero retained markers. B2-C4B.2 therefore stopped rather than disable broad logging, claim source encryption was sufficient, or move the same leakage to another managed front door. The later founder decision below records the separate, explicit synthetic-pilot-only risk acceptance that governs the next authorization attempt.

## Founder synthetic-pilot risk acceptance

After independent security review, the founder explicitly accepted the bounded residual risk for the isolated synthetic pilot only: Google-managed Cloud Run request logging may retain a single-use authorization code and opaque state in the access-restricted `_Default` bucket for its normal 30-day retention period. Broad logging remains enabled, historical entries remain under normal retention, and no proxy or PKCE change is introduced in this preflight.

This decision is limited to the founder-controlled test account and synthetic environment. The callback URL contains neither access token, refresh token, client secret, nor business document data. The client secret remains server-side in Secret Manager; any refresh credential persistence remains conditional on dedicated KMS encryption. State retains ten-minute expiry and atomic single consumption. Drive API remains disabled and Drive requests remain zero before authorization.

This acceptance does not apply to Client Zero, Christophersen Ascensores documents, customer data, real business documents, multi-tenant production, or any customer environment. Those environments remain separately gated and require a logging/privacy architecture appropriate to their data boundary.

Final IAM review found no explicit Logging Viewer, Private Log Viewer, View Accessor, or Logging Admin grant. The runtime service account has no project-level role. Existing basic project roles remain limited to the founder Owner and the default build identity Editor; this preflight makes no IAM changes and does not treat the synthetic-pilot risk acceptance as authorization to broaden access.
