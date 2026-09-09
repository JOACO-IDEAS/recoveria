# RecoverIA Product Thesis

## Thesis

Accounts-receivable teams do not primarily need another accounting system. They need an operational layer that assembles fragmented evidence, exposes uncertainty, identifies the next reviewable work, and preserves human authority. RecoverIA will transform invoice documents and collection history into a traceable receivables workspace without inventing facts or acting externally on its own.

## Client Zero hypothesis

For Christophersen Ascensores, the first useful outcome is not automated collection. It is a trustworthy answer to: what is outstanding, how old is it, who appears responsible, which records are uncertain, and what should a person review first? A controlled sample should prove that invoices can be parsed and resolved into administrations and consorcios with visible evidence and confidence.

## Users and jobs

- Collection operator: find and work the most important review items without reconstructing history manually.
- Finance lead: understand outstanding balance, aging, concentrations, and data-quality gaps.
- Manager: inspect why an item was prioritized and whether follow-up happened.
- Reviewer: confirm uncertain extraction/entity matches and correct them without erasing source evidence.
- Future legal reviewer: inspect configurable flags and underlying evidence; the product never determines a universal prescription deadline.

## Product principles

1. Evidence before assertion: every extracted, normalized, or recommended fact points to its source and transformation.
2. Raw, normalized, and confirmed are separate states. Human correction adds provenance; it does not rewrite history.
3. Human authority is structural. The system may read, extract, classify, match, explain, prioritize, draft, and prepare. It may not send, threaten, negotiate, accept terms, or initiate legal action in the MVP.
4. Explainability beats a mysterious score. Priorities expose the applicable signals and their values.
5. Operational inbox, not ERP. RecoverIA may integrate with systems of record later; it should not recreate general ledger/accounting functionality.
6. Tenant isolation and auditability begin with the first persisted row.
7. Cost follows document type: deterministic parsing first, OCR only when required, probabilistic extraction only where justified.

## Initial information architecture

Primary navigation: Inicio, Cartera, Facturas, Casos, Contactos, Importaciones, Agente, Configuración.

`Inicio` is “Atención de hoy”: old invoices, large overdue balances, stale cases, unresolved entity matches, missing contacts, and promises requiring review. Each card shows evidence, reason, age, amount when available, confidence, and the permitted next human action.

## Success and non-goals

The first-value experiment succeeds when a reviewer can import a synthetic or separately authorized sample, reconcile extraction uncertainty, and produce reproducible totals and aging with no silent evidence loss. Phase 0 does not prove collection uplift and does not implement ingestion, OCR, agent behavior, outbound communication, legal workflows, or production infrastructure.
