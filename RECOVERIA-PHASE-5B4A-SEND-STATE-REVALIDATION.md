# RecoverIA Phase 5B.4A — Send State Machine and Revalidation

## Boundary and state model

Phase 5B.4A adds a pure domain boundary between a human-approved communication draft and any future provider execution. The lifecycle vocabulary is `DRAFT` → `APPROVED` → `REVALIDATION_REQUIRED` → either `READY_TO_SEND` or `BLOCKED_BEFORE_SEND`. There are no `SENT`, delivery, or failure outcomes and no provider integration.

`CommunicationSendPreparation` is an immutable audit object linking tenant, case, draft, draft request, approval, selected contact/channel, intent, requester, request time, approved/current fingerprints, blockers, evidence, and an idempotency key. Creation requires the complete approved request–draft–approval chain. Rejected approvals, mismatched links, mismatched scope, and cross-tenant/cross-case data fail hard.

Phase 5B.4A.1 replaces the ambiguous approval `actorId` with an explicit `{ kind: "HUMAN" | "SYSTEM", id }` actor. Send preparation accepts only `APPROVED` decisions whose actor kind is exactly `HUMAN` and whose actor ID is non-empty. The ID string itself carries no semantics: `{ kind: "HUMAN", id: "system" }` is human provenance, while `{ kind: "SYSTEM", id: "reviewer" }` is not. Missing, malformed, unknown, or empty actors fail closed at runtime. Approval creation never defaults or converts actor provenance. It also requires valid timestamps and enforces `approval.decidedAt >= draft.createdAt`; the same invariant is checked again at the send boundary.

## Send-time revalidation

`revalidateCommunicationForSend()` accepts an existing preparation, its approved request/draft/approval chain, current `CommunicationPreparationInput`, and an explicit `asOf`. It requires that `asOf` match both current case projection and interaction context and never reads the clock.

The function re-runs `evaluateCommunicationPreparation()` against current state. It does not trust prior eligibility and does not select a fallback contact or channel. When multiple contacts or channels are now ready, it assesses only the originally approved IDs. It rechecks tenant/case scope, draftable action and intent, entity confidence, legal-review state, current contact relationship, selected channel, invoice scope, target balances, promises, payment claims, disputes, policy, and evidence.

Every fingerprint mismatch adds `STALE_DRAFT`; domain comparisons add the most specific detectable blockers. The bounded taxonomy is `STALE_DRAFT`, `APPROVAL_INVALID`, `CONTACT_NO_LONGER_ELIGIBLE`, `CHANNEL_NO_LONGER_ELIGIBLE`, `BALANCE_CHANGED`, `ZERO_BALANCE`, `INVOICE_SCOPE_CHANGED`, `PAYMENT_CLAIM_APPEARED`, `PAYMENT_STATE_CHANGED`, `PROMISE_STATE_CHANGED`, `DISPUTE_OPENED`, `RECOMMENDATION_CHANGED`, `POLICY_CHANGED`, `LEGAL_REVIEW_REQUIRED`, `ENTITY_AMBIGUITY`, `EVIDENCE_CHANGED`, `TENANT_MISMATCH`, and `CASE_MISMATCH`. Structurally invalid approval or scope input is rejected before a preparation result rather than collapsed into a generic workflow error.

## Fingerprint and fact semantics

The send-safety fingerprint includes projections, current contact resolution, explicit selections, invoice financial facts, the payment-verification policy switch, and active, broken, fulfilled, superseded, pending, verified, rejected, resolved, and disputed interaction states. This ensures that a resolved claim or dispute cannot restore an old fingerprint and revive an earlier approval. Unrelated chronology entries and non-safety display labels are excluded. An unchanged newly prepared draft after a resolved state can proceed; an older draft spanning that transition cannot. Array-order canonicalization remains deferred: reordering invoice inputs currently causes safe over-blocking through `STALE_DRAFT` rather than risking an unsafe false match.

Invoice inclusion is recomputed. Any set difference blocks the whole old draft; invoices are never silently removed. Every approved invoice outstanding/overdue amount is compared exactly, and any change—including a decrease—blocks without text patching. A zero balance is separately identified. A new pending claim blocks routine collection; a verification request blocks once its claim is no longer pending. Verified, rejected, or superseded claim transitions invalidate older approvals. Open target disputes block, and later resolution does not revive an approval that predates the dispute. A promise-follow-up remains eligible only while the same safely supported promise remains broken; active, fulfilled, superseded, disputed, or allocation-ambiguous transitions block it.

## Authorization and idempotency

Successful revalidation returns an immutable authorization result with `state: READY_TO_SEND`. It records tenant, case, draft, approval, contact, channel, intent, explicit authorization/as-of time, current fingerprint, evidence, and deterministic idempotency key. The execution identity is derived from tenant ID, draft ID, and current fingerprint—not approval ID. Two independent approvals of the same draft remain distinct audit decisions but resolve to the same execution identity under the same current state. A different draft receives a different identity. Reapproving the same stale draft cannot create a new send opportunity; changed content requires a new draft, approval, and revalidation.

Authorization means only “safe under the evaluated state at this moment.” It has no invented TTL and remains usable only while the fingerprint and state still match. Any state change returns `BLOCKED_BEFORE_SEND`; 5B.4A never regenerates or edits content. The human workflow must prepare, review, approve, and revalidate a new draft.

The authorization object is deliberately not exported as a named portable permission type, has no public constructor/factory, and is not accepted by any execution API. A structurally similar object assembled by a UI, client, deserializer, database loader, or caller proves nothing. `revalidateCommunicationForSend()` is the only legitimate producer today. Future execution must receive the underlying identities and current domain state, perform revalidation immediately adjacent to provider invocation, and use only the direct successful result in that same call path.

## Audit and future execution race

The immutable request, draft, approval, preparation, and optional authorization objects preserve who requested and approved what, the approved evidence/fingerprint, the current fingerprint and evaluation time, and why revalidation passed or failed. No persistence or generic audit framework is introduced.

A race remains: revalidation can pass at T1, authorization can be created at T2, state can change at T3, and provider execution could begin at T4. A fingerprint token alone does not solve this. Phase 5B.4B must revalidate immediately before provider invocation and add execution serialization/atomicity so concurrent execution cannot consume the same draft identity twice. Phase 5B.4A.1 performs no provider call and has no send side effect.

## Deferred P2 work

Still deferred are fingerprint canonicalization, cryptographic fingerprint migration, case-wide fingerprint audit clarity, amount-to-invoice pairing, natural amount/date formatting variants, contact-name validation outside the greeting, minimum fact/evidence reference enforcement, per-invoice payment allocation, write-time human gates, Prisma reconciliation, persistence, providers, sending, webhooks, inbox synchronization, scheduling, cadence, and AI drafting. Broken-to-superseded and allocation-ambiguous promise behavior remains governed by the existing conservative promise revalidation path; broader promise-allocation work remains deferred.
