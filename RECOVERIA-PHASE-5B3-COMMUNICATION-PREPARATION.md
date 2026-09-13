# RecoverIA Phase 5B.3 — Communication Preparation

## Communication eligibility

The domain-first module in `src/modules/communication-preparation` implements the preparation-only chain: deterministic case projection → interaction context → contact/channel eligibility → authorized facts → draft request → provider draft → deterministic validation → human approval object. It has no send state or external side effect.

`evaluateCommunicationPreparation()` returns `READY_FOR_DRAFT`, `REVIEW_REQUIRED`, or `BLOCKED`. A next action alone is insufficient. Runtime validation enforces tenant, case, administration, building, nested contact/channel scope, authoritative non-negative invoice amounts, unique invoice IDs, and evidence.

Draftable actions are intentionally bounded: `CONTACT`, `FOLLOW_UP`, `REQUEST_INFORMATION`, and—only when explicitly enabled—`VERIFY_PAYMENT`. `WAIT`, `REVIEW_DISPUTE`, `PREPARE_LEGAL_REVIEW`, `CLOSE_CASE`, and every other action fail closed.

## Contact and channel selection

Only 5B.2A `READY` contacts participate. Exactly one ready contact may be selected deterministically; multiple ready contacts produce `CONTACT_SELECTION_REQUIRED`. An explicit contact selection must still reference a ready candidate. The same rule applies to confirmed `EMAIL` and `WHATSAPP` channels. Multiple channels produce `CHANNEL_SELECTION_REQUIRED`; `PHONE` remains manual/non-draftable. No preference is inferred.

Preparation blocks or requires review for missing/review-only contacts, missing/non-draftable channels, superseded or invalid relationships, entity ambiguity, administration mismatch, legal review, zero balance, active-promise wait, missing action evidence, open disputes, pending claims, or lack of a safely targetable invoice.

## Authorized fact set and trust categories

`CommunicationAuthorizedFacts` is an immutable least-privilege object—not the full case or database context. It contains only the selected administration/building/contact/channel, deterministic intent/action, included invoice facts, excluded invoices with reasons, precomputed target amounts, an optional safe promise or payment-claim fact, bounded chronology summary facts, and evidence references.

Every atomic authorized fact uses `FACT`, `INTERPRETATION`, `UNCERTAINTY`, `BLOCKER`, `RECOMMENDATION`, or `HUMAN_DECISION`. Draft templates primarily reference `FACT` and `HUMAN_DECISION`. Uncertainty and blockers never become affirmative claims.

In mixed cases, only eligible invoices enter the draft. Disputed, payment-verification, active-promise, or otherwise non-collectible invoices are listed separately with exclusion reasons. All amounts are precomputed from authoritative financial input; providers perform no financial arithmetic.

## Intent and tone

The bounded intent taxonomy is `INITIAL_COLLECTION_CONTACT`, `FOLLOW_UP`, `PROMISE_FOLLOW_UP`, `PAYMENT_VERIFICATION_REQUEST`, and `INFORMATION_REQUEST`. Intent is derived from deterministic action/context, never chosen by a provider.

The only tone policy is `PROFESSIONAL_NEUTRAL` in `es-AR`: brief, respectful, non-threatening, non-legalistic, and non-accusatory. No slider, marketing persona, urgency, or preference is introduced.

## Promise, claim, and dispute language safety

Promise language is authorized only from a human-confirmed `BROKEN` promise covering a target invoice, with no open dispute and no unresolved fulfillment-allocation blocker. A fulfilled or uncertain promise cannot authorize “incumplido” language.

A pending claim prevents ordinary collection for its invoices. When policy explicitly permits `PAYMENT_VERIFICATION_REQUEST`, the deterministic wording says that a reported payment is still being verified; it cannot say the payment does not exist or that payment failed.

An open dispute blocks routine drafting for its invoice. 5B.3 produces no rebuttal, pressure message, or dispute communication.

## Provider boundary and deterministic baseline

`CommunicationDraftProvider` is the isolated future provider seam. `DeterministicTemplateDraftProvider` is the sole implementation in 5B.3 and requires no API, network, model, or dependency. It produces conservative Spanish email/WhatsApp drafts from the authorized fact set only. Every `CommunicationDraft` has `requiresHumanApproval: true`, fact/evidence references, warnings, method, snapshot fingerprint, and explicit timestamps.

No OpenAI, Anthropic, Gemini, email, WhatsApp, SMS, Meta, Twilio, Resend, webhook, inbox, campaign, or scheduling integration exists.

## Prohibited claims and deterministic validation

The prohibited-claims policy covers unsupported debtor/liability assertions, payment-failure statements while verification is pending, unsupported broken-promise claims, prescription claims, legal threats, fake “last notice” language, and unsupported repeated-contact assertions.

`validateCommunicationDraft()` treats provider output as untrusted and fails closed on scope mismatch, missing human-approval requirement, unsupported contact name, amount, invoice number or date, legal/prescription threats, last-notice language, liability claims, unsafe payment/promise claims, unsupported repeated-contact language, and unauthorized fact/evidence references. Subject and body are both validated.

Phase 5B.3A broadens the deterministic phrase families for each prohibited category across both subject and body. Before matching, safety text is normalized with Unicode accent removal, lowercase conversion, whitespace collapse, and trimming. The patterns remain deliberately bounded to the approved Spanish phrases rather than attempting unrestricted semantic interpretation. Neutral payment-verification wording such as “nos informaron un pago que todavía estamos verificando” remains permitted.

Invoice hallucination detection now recognizes the production-style `F-` prefix, including numeric and alphanumeric suffixes, while preserving `FAC-`, `FC-`, and `INV-`. A referenced invoice must still be in the authorized included-invoice fact set; invented, excluded, or other-case `F-` identifiers fail validation.

## Human approval and staleness

`recordDraftApproval()` creates an immutable `APPROVED` or `REJECTED` human domain object with actor and timestamp. Approval triggers nothing.

Draft requests and drafts carry a deterministic snapshot fingerprint over projection, selected contact/channel, eligibility, financial invoice facts, and current promise/claim/dispute context. `isCommunicationDraftStale()` detects changes. Future sending must re-evaluate eligibility and facts; send revalidation is deliberately not implemented here.

The fingerprint also includes the explicit `allowPaymentVerificationRequest` policy switch. Revoking that permission therefore makes an already prepared verification draft stale. The current input contract has no other safety policy booleans.

Chronology summaries are least privilege: only entries with at least one related invoice ID intersecting the included draft invoice IDs may enter authorized facts. Entries belonging only to disputed, pending-claim, active-promise, non-collectible, or other-case invoices are excluded, as are chronology entries with no invoice IDs. No case-level chronology exception is currently needed.

## Synthetic scenarios and UI decision

Behavioral coverage includes eligible email/WhatsApp, non-draftable phone, multiple-contact/channel selection, review-only contact, dispute, claim verification language, active promise, safe broken promise, fulfilled-promise suppression, mixed-invoice filtering, zero balance, legal review, entity ambiguity, tenant/administration rejection, provider hallucinations, unsupported amounts/invoices/dates, stale snapshots, approvals, determinism, immutability, no mutation, and absence of send side effects.

No UI was added. The current showroom Case Detail is backed by the earlier flattened demo model rather than the new authoritative contact/interaction contracts. Presenting a selectable contact or actionable preview from that model would fabricate eligibility. UI integration is deferred until the product surface consumes these domain projections safely.

## Client Zero unknowns and deferred work

Real tone acceptance, contact selection practice, channel preference, verification-request policy, invoice grouping, evidence expectations, reviewer roles, approval workflow, and legal wording remain Client Zero unknowns.

Deferred to later phases are detailed per-invoice payment allocation, write-time human gates for interaction facts, Prisma reconciliation, persistence, UI wiring, AI-backed optional providers, editing, send-time revalidation, message delivery, email/WhatsApp providers, webhooks, scheduling, cadence, reminders, inbox sync, campaigns, autonomous sending, negotiation, and legal execution.

Phase 5B.3A additionally leaves the reviewed P2 limitations unchanged: amount-to-invoice pairing, natural-language amount/date variants, contact-name detection outside the greeting, empty fact/evidence-reference bypasses, a human/system discriminator on `DraftApproval`, per-invoice allocation, and a write-time gate. Phase 5B.3A still has no send capability.
