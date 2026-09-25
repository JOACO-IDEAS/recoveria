# RecoverIA B2-C4B.1 — Google callback metadata compatibility

## Incident and correction

The first controlled consent returned to the exact Cloud Run callback with one each of `code`, `state`, `iss`, and `scope`. The B2-C4B.0 parser allowed only `code`, `state`, and `error`, so it returned `INVALID_CALLBACK` before durable state validation. No callback values are recorded here.

The corrected success contract requires exactly one each of `code`, `state`, `iss`, and `scope`, with no other keys. The issuer observed consistently in sanitized incident metadata is the canonical HTTPS Google Accounts issuer. RecoverIA compares it by exact equality with `https://accounts.google.com`; host-only, arbitrary, and lookalike issuers are rejected.

The scope value is parsed as a space-delimited OAuth scope set using the OAuth scope-token character grammar. The set must equal the single approved scope, `https://www.googleapis.com/auth/drive.readonly`. Missing, duplicated, malformed, lookalike, broader, write-capable, or additional scopes are rejected.

## Error callback contract

A denial is distinct from success. It accepts exactly one `state` and one `error`, with an optional single `iss`. When present, the issuer receives the same exact validation. Denials do not require `code` or `scope`, never echo provider errors, and still pass through durable state validation and one-time consumption before the runtime returns a sanitized rejection.

## State and failed-attempt disposition

No state architecture changed: state remains an opaque 32-byte random handle represented durably only by its SHA-256 hash, bound to organization, operator, connection, and callback identity, with ten-minute expiry and atomic one-time consumption.

The rejected real attempt remains as historical durable evidence. It was valid and unconsumed when the provider callback arrived, then expired normally. It is not reused, deleted, or replaced during B2-C4B.1. The lifecycle remains `AUTHORIZATION_PENDING`; no credential envelope or connected lifecycle was created.

## Validation and phase boundary

Synthetic tests cover the observed success shape, exact issuer, wrong and lookalike issuers, missing and duplicate issuer, exact scope-set parsing, missing/additional/broader/write/lookalike/duplicate scope, duplicate code/state, unknown parameters, malformed callbacks, strict denial shapes, durable expiry, replay, concurrency, and zero token exchange for parser failures.

Deployment regression uses synthetic callback values only. B2-C4B.1 does not generate an authorization URL, perform consent, exchange a real code, obtain tokens, enable or call Drive, or access Client Zero. A new real authorization attempt remains separately gated by explicit founder action after this correction is deployed and verified.

Revision `recoveria-pilot-runtime-00011-zzx` passed synthetic parser regression while remaining OAuth-not-connected and Drive-disabled. Read-only aggregate verification found one expired, unconsumed historical authorization state, zero credential envelopes, and one `AUTHORIZATION_PENDING` lifecycle.

Final leakage review found that the managed Cloud Run HTTP request log records callback request URLs before application-level sanitization. This platform-level behavior can retain query values even though RecoverIA never logs or echoes them. B2-C4B.1 initially stopped on that finding; the subsequent B2-C4B.2 investigation and documented founder synthetic-pilot-only risk acceptance govern the final disposition and any later authorization attempt.
