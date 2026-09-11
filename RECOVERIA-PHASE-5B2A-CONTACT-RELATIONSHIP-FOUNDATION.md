# RecoverIA Phase 5B.2A — Contact & Relationship Foundation

## Domain model

The 5B.2A domain lives in `src/modules/contact-relationships` and deliberately separates three facts:

- `ContactIdentity`: who the person is.
- `ContactChannel`: how that person can be reached.
- `AdministrationContactRelationship`: why and within which administration/building scope that person may be contacted.

No contact ID is embedded as permanent administration truth. One contact may hold multiple tenant-valid administration relationships, and one administration may have multiple contacts without a global primary contact.

## Identity, roles, and channels

Identity certainty is explicit: `CONFIRMED`, `UNVERIFIED`, or `CONFLICTING`. The bounded relationship-role vocabulary is `ADMINISTRATOR`, `PAYMENTS`, `ACCOUNTING`, `TREASURY`, `OPERATIONS`, `OWNER`, `ASSISTANT`, `GENERAL`, and `OTHER`; roles are never inferred from names or addresses.

Channels are separate records with type `PHONE`, `WHATSAPP`, or `EMAIL`; raw and optional deterministically normalized values; status; observation/confirmation dates; and evidence. Channel status means:

- `CONFIRMED`: explicitly supported and ready for eligibility evaluation.
- `UNVERIFIED`: observed but not confirmed; requires review.
- `STALE`: explicitly known to be stale; no time threshold is inferred.
- `INVALID`: explicitly invalid and excluded.

No preferred channel is inferred.

## Relationships, scope, and temporal validity

Each relationship records administration, contact, role and role certainty, status, scope, optional validity dates, evidence, and optional supersession. `ADMINISTRATION_WIDE` applies to every building evaluated for that administration and carries no embedded building IDs. `BUILDING_SPECIFIC` requires explicit building IDs and applies only to those buildings.

Relationship status is `CONFIRMED`, `UNVERIFIED`, `CONFLICTING`, `SUPERSEDED`, or `INVALID`. Optional `validFrom` and `validUntil` are evaluated against an explicit `asOf`; missing dates remain unknown rather than invented. No automatic staleness threshold or `Date.now()` dependency exists.

Corrections are append-only. `appendContactRelationship()` preserves prior records, validates the referenced history, prevents cross-tenant/cross-administration correction and rejects forked supersession. Effective selection removes superseded facts while history remains available.

## Provenance and conflict handling

Identity, channel, and relationship facts require evidence references. Evidence may point to existing RecoverIA sources such as invoice/document provenance, imported administration records, email signatures, or manual confirmation. The domain does not create new external evidence types and never accepts an AI guess as truth.

Conflicting identity, role, or relationship evidence is surfaced as `CONFLICTING_EVIDENCE`; it is never silently resolved. Such candidates require review and are not ready for autonomous communication.

## Deterministic eligibility and safety rules

`resolveCollectionContacts(case, context)` returns `readyContacts`, `reviewRequiredContacts`, `ineligibleContacts`, and aggregate `blockers`. Every candidate explains its contact, role, channels, scope, status, evidence, and blockers.

A candidate is ready only when identity, relationship and role are confirmed; the relationship is valid on the supplied date and covers the supplied building; and at least one channel is confirmed. Unverified or conflicting truth is review-required. Invalid/superseded/out-of-date/out-of-scope relationships and candidates without a usable channel are ineligible. Invalid channels are never eligible; stale or unverified-only channels never make a candidate ready.

All inputs are runtime tenant-validated, references must resolve, IDs must be unique, building scope must be structurally valid, and provenance cannot be empty. Results are deeply immutable, deterministically ordered, and do not mutate cases or source data.

## Administration changes and liability safety

The case's explicit `administrationId` remains the relationship context for its debt. The resolver rejects a different administration supplied as “current” context instead of reassigning the case. Therefore a later building-management change neither rewrites historical relationships nor implies that the new administration is liable for old debt.

## Synthetic scenarios

The synthetic truth set covers confirmed WhatsApp eligibility, multiple contacts and roles, administration-wide and building-specific scope, stale and invalid channels, unverified and conflicting relationships, superseded historical contacts, temporal validity, building administration changes, cross-tenant rejection, and one contact related to multiple administrations. Tests additionally prove deterministic output, immutability, no `Date.now()`, no liability inference, and absence of communication behavior.

## Persistence gap / Prisma findings

The existing Prisma schema usefully separates `Contact`, `ContactPoint`, and `ContactAssociation`, and already has `AdministrationBuilding` temporal links. No schema change is made in 5B.2A.

Persistence is not yet lossless for this domain model: `Contact` has no explicit identity certainty or contact-level evidence list; `ContactPoint` has `verifiedAt` but no `UNVERIFIED/CONFIRMED/STALE/INVALID` status, raw/normalized distinction, or full evidence history; `ContactAssociation.purpose` is unbounded and has no bounded role/status/conflict model, explicit scope discriminator, multi-building scope, or supersession chain. Tenant-safe composite relational constraints and reconciliation with the TypeScript collections vocabulary also require design before persistence. A migration must not be forced until those semantics are reconciled.

## Client Zero unknowns and deferred behavior

Real roles, contact ownership, preferred channels, confirmation practice, staleness policy, operator structure, cadence and escalation behavior remain Client Zero unknowns. No Client Zero or real contact data was used.

Deferred to 5B.2B+ are persistence reconciliation, editing UI, human review workflows, contact selection recommendations, channel preference, message content/drafts, sending, providers, schedules, cadence, retries, inbox sync, promises/payments/legal workflow expansion, and autonomous behavior. This phase answers only who could safely be contacted; it does not answer when, how often, what to say, or whether to send.
