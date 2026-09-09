# RecoverIA Case Workspace

## Purpose

The case workspace is the operational center for a human collections operator. It translates deterministic service output into an inspectable recommendation while preserving its financial and evidentiary context.

## Contents

- Case, administration, and building identity.
- Outstanding balance, overdue invoice count, oldest age, and contact recency.
- Priority tier and attention type returned by Phase 4.
- Every reason and blocker, each with its underlying evidence references.
- Related invoices and their ledger-derived status.
- A bounded next-action panel that remains informational in this phase.

## Human-control contract

The workspace never sends a message, changes an invoice, accepts an entity match, or triggers a legal workflow. Recommendations describe what a human should inspect or prepare. Blockers are first-class: unresolved identity, missing contact, disputes, and active promises can prevent routine follow-up.

## Trust rules

Financial amounts come from ledger reconciliation, not UI arithmetic. Priority comes from the approved deterministic policy. Evidence references are displayed verbatim from synthetic records. A missing or uncertain fact is described as such and never completed by inference.
