# RecoverIA Prioritization Policy

Policy `recoveria-operational@1` centralizes: stale contact 30 days, old receivable 365 days, large balance ARS 1,000,000 (available for reporting), and maximum eight Attention-of-Today items. Aging/legal policies remain separately versioned.

Precedence is explicit: `REVIEW_LEGAL_THRESHOLD` (CRITICAL), `REVIEW_ENTITY`, `ADD_CONTACT`, `REVIEW_DISPUTE`, `VERIFY_PROMISE` (CRITICAL), active-promise `NO_ACTION`, stale `FOLLOW_UP`, `REVIEW_OLD_RECEIVABLE`, ordinary `FOLLOW_UP`, `NO_ACTION`. Data-quality/dispute blockers prevent unsafe routine follow-up. Balance and invoice count add grounded reasons but do not override safer action semantics.

This is operational policy, not a legal rule or probability score. No LLM prose or hidden weighting exists.
