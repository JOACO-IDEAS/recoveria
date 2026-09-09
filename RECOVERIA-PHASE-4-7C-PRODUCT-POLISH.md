# RecoverIA Phase 4.7C — Product Polish & Interaction

## Implemented scope

This phase implements only the approved interaction findings over the Phase 4.7B Spanish product. It adds presentation-level sorting and filters, fixes case ordering, improves contextual navigation and feedback, adds open cases to administration detail, provides a Spanish 404, and makes evidence labels more readable. Domain, financial, ingestion, and prioritization semantics remain unchanged.

## Selected audit findings

- The case list could contradict the deterministic priority hierarchy.
- Static tables did not answer common comparison questions quickly.
- “Más antiguas” was an aging-bucket filter, not a true oldest-first order.
- Case and import queues lacked compact filters.
- Administration detail did not expose related operational cases.
- Related objects did not always link back to one another.
- Case detail lacked a clear return path to the priority queue.
- Interaction feedback and the default 404 felt less polished than the product surface.
- Evidence provenance used raw-looking references.

## Sorting behavior

Sorting is implemented in pure presentation helpers over already-computed rows. Cartera defaults to overdue balance descending and supports pending balance, overdue balance, and invoice count. Facturas defaults to issue date descending and supports issue date, due date, pending balance, and age. Selecting age descending provides true oldest-first behavior.

Casos defaults to the existing priority tier in this order: Crítica, Alta, Media, Baja. Within a tier, cases present in Attention-of-Today retain that service’s order. Remaining ties use outstanding exposure descending and then stable case identity. This is display ordering only, not a second prioritization engine. Casos also supports exposure sorting.

## Filter behavior

Casos filters use existing values only: all, critical tier, dispute flag, missed promise, and recommendations that already represent missing identity/contact information. Importaciones filters existing ingestion states into all, review required, and unprocessed (failed or unsupported). Filters compose with sorting in client-side presentation state.

## Cross-navigation

- Invoice → administration, when the invoice has a confirmed administration identifier.
- Invoice ↔ case remains available.
- Case → administration, when supported.
- Case → invoice remains available.
- Administration → open case.
- Case detail → priority list.

No consorcio workspace or new relationship was invented.

## Responsive behavior

Filter pills scroll horizontally at narrow widths, sort controls wrap, and existing responsive tables/card treatments remain intact at 390px. Focus indicators remain independent from selected navigation, active filter, and sort state.

## Deferred scale work

Pagination, virtualization, global search, and saved views remain deferred. Pure sort/filter helpers and row-view models keep these future changes separate from domain semantics.

## Validation and safety

Regression coverage verifies case tier order, within-tier queue order, list sorting, true oldest-first behavior, filters, open cases, cross-links, Spanish 404, unchanged financial values, tenant isolation, and Client Zero independence. The phase uses synthetic fixtures only and does not access the Client Zero inbox, modify ConcilIA, call external services, deploy, or begin Phase 4.6/5.
