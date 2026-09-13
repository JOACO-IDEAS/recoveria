# RecoverIA Phase 5B.4A — Send State Machine and Revalidation

## Boundary and state model

Phase 5B.4A adds a pure domain boundary between a human-approved communication draft and any future provider execution. The lifecycle vocabulary is `DRAFT` → `APPROVED` → `REVALIDATION_REQUIRED` → either `READY_TO_SEND` or `BLOCKED_BEFORE_SEND`. There are no `SENT`, delivery, or failure outcomes and no provider integration.

`CommunicationSendPreparation` is an immutable audit object linking tenant, case, draft, draft request, approval, selected contact/channel, intent, requester, request time, approved/current fingerprints, blockers, evidence, and an idempotency key. Creation requires the complete approved request–draft–approval chain. Rejected approvals, missing human actor identity/time, mismatched links, mismatched scope, and cross-tenant/cross-case data fail hard. `DraftApproval` still lacks an actor-kind discriminator, so 5B.4A can conservatively require a non-empty actor ID and decision timestamp but cannot independently prove that the actor is human.

## Send-time revalidation

`revalidateCommunicationForSend()` accepts an existing preparation, its approved request/draft/approval chain, current `CommunicationPreparationInput`, and an explicit `asOf`. It requires that `asOf` match both current case projection and interaction context and never reads the clock.

The function re-runs `evaluateCommunicationPreparation()` against current state. It does not trust prior eligibility and does not select a fallback contact or channel. When multiple contacts or channels are now ready, it assesses only the originally approved IDs. It rechecks tenant/case scope, draftable action and intent, entity confidence, legal-review state, current contact relationship, selected channel, invoice scope, target balances, promises, payment claims, disputes, policy, and evidence.

Every fingerprint mismatch adds `STALE_DRAFT`; domain comparisons add the most specific detectable blockers. The bounded taxonomy is `STALE_DRAFT`, `APPROVAL_INVALID`, `CONTACT_NO_LONGER_ELIGIBLE`, `CHANNEL_NO_LONGER_ELIGIBLE`, `BALANCE_CHANGED`, `ZERO_BALANCE`, `INVOICE_SCOPE_CHANGED`, `PAYMENT_CLAIM_APPEARED`, `PAYMENT_STATE_CHANGED`, `PROMISE_STATE_CHANGED`, `DISPUTE_OPENED`, `RECOMMENDATION_CHANGED`, `POLICY_CHANGED`, `LEGAL_REVIEW_REQUIRED`, `ENTITY_AMBIGUITY`, `EVIDENCE_CHANGED`, `TENANT_MISMATCH`, and `CASE_MISMATCH`. Structurally invalid approval or scope input is rejected before a preparation result rather than collapsed into a generic workflow error.

## Fingerprint and fact semantics

The send-safety fingerprint includes projections, current contact resolution, explicit selections, invoice financial facts, the payment-verification policy switch, and active, broken, fulfilled, superseded, pending, verified, rejected, resolved, and disputed interaction states. This ensures that a resolved claim or dispute cannot restore an old fingerprint and revive an earlier approval. Unrelated chronology entries and non-safety display labels are excluded. An unchanged newly prepared draft after a resolved state can proceed; an older draft spanning that transition cannot.

Invoice inclusion is recomputed. Any set difference blocks the whole old draft; invoices are never silently removed. Every approved invoice outstanding/overdue amount is compared exactly, and any change—including a decrease—blocks without text patching. A zero balance is separately identified. A new pending claim blocks routine collection; a verification request blocks once its claim is no longer pending. Verified, rejected, or superseded claim transitions invalidate older approvals. Open target disputes block, and later resolution does not revive an approval that predates the dispute. A promise-follow-up remains eligible only while the same safely supported promise remains broken; active, fulfilled, superseded, disputed, or allocation-ambiguous transitions block it.

## Authorization and idempotency

Successful revalidation returns an immutable `CommunicationSendAuthorization` with `state: READY_TO_SEND`. It records tenant, case, draft, approval, contact, channel, intent, explicit authorization/as-of time, current fingerprint, evidence, and deterministic idempotency key. The key is derived from tenant ID, draft ID, approval ID, and current fingerprint. Repeating the same logical preparation or authorization produces the same key and domain result; no provider retry policy is implied.

Authorization means only “safe under the evaluated state at this moment.” It has no invented TTL and remains usable only while the fingerprint and state still match. Any state change returns `BLOCKED_BEFORE_SEND`; 5B.4A never regenerates or edits content. The human workflow must prepare, review, approve, and revalidate a new draft.

## Audit and future execution race

The immutable request, draft, approval, preparation, and optional authorization objects preserve who requested and approved what, the approved evidence/fingerprint, the current fingerprint and evaluation time, and why revalidation passed or failed. No persistence or generic audit framework is introduced.

A race remains: revalidation can pass at T1, payment can arrive at T2, and provider execution can begin at T3. A fingerprint token alone does not solve this. Phase 5B.4B must either revalidate immediately before provider invocation or atomically consume an authorization whose fingerprint is still current. Phase 5B.4A performs no provider call and has no send side effect.

## Deferred P2 work

Still deferred are amount-to-invoice pairing, natural amount/date formatting variants, contact-name validation outside the greeting, minimum fact/evidence reference enforcement, the approval human/system actor discriminator, per-invoice payment allocation, write-time human gates, Prisma reconciliation, persistence, providers, sending, webhooks, inbox synchronization, scheduling, cadence, and AI drafting. The missing approval actor-kind discriminator is the direct send-boundary limitation; until the model is extended, only explicit actor identity and timestamp can be enforced.
