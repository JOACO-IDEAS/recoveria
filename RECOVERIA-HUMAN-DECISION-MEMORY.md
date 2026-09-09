# RecoverIA Human Decision Memory

Human actions are immutable `DecisionEvent`s: confirm existing, reject candidate, create new, or defer. Each records tenant, normalized alias, entity type, optional entity, actor, timestamp, reason, source references, and optional `supersedesId`.

`projectAliases` replays non-superseded decisions into a current `CONFIRMED`/`REJECTED` alias projection. The projection is disposable and rebuildable; decision history is authoritative. Correction appends a new event referencing the prior event. It never edits or deletes history.

Confirmed aliases may later auto-resolve only under the strict identity policy. Rejected alias/entity pairs are excluded and surfaced as `HISTORICALLY_REJECTED`; the resolver cannot quietly reconsider them. Create-new/defer events remain history but do not create alias mappings until an entity and confirmation exist.

Before real persistence, transactionally append the decision and update/rebuild the projection, add append-only database privileges, authenticate the actor, validate tenant/entity references, and audit concurrent decisions.
