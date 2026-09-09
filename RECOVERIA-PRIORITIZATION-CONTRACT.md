# RecoverIA Prioritization Contract

Phase 1 defines types only in `src/lib/domain/prioritization-contract.ts`. It implements no ranking engine and no AI call.

## Input

Each tenant-scoped case input contains: as-of time, currency, days overdue, outstanding amount in integer minor units, unpaid invoice count, last contact when known, contact-attempt count, promise status, dispute state, contact availability, entity-confidence state, configured legal-review flag, and evidence references.

Unknown facts remain absent/explicit; they are never filled by inference. A disputed invoice remains financially visible but can become a blocker or hold reason in a future policy. Missing contact/entity resolution can recommend resolving data before follow-up.

## Output

The future deterministic policy returns:

- `recommendation`: `REVIEW`, `HOLD`, or `RESOLVE_DATA`;
- `reasons[]`: stable code, human-readable text, and the evidence references that prove it;
- `blockers[]`: stable code and explanation;
- unioned `evidenceReferences[]`;
- `policyVersion`.

There is deliberately no generic numeric AI score. Ordering, when implemented in Phase 5, must be reproducible from explicit policy and signal values. Explanation text may verbalize only supplied facts.

## Authority boundary

The output is prepared work for a human. It cannot send, threaten, negotiate, accept payment terms, determine liability/enforceability/prescription, or initiate legal action. Legal age contributes a workflow flag, never a conclusion.
