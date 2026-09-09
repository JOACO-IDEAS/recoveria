# RecoverIA UI Information Architecture

## Navigation model

| Area | Operator question | Primary object |
| --- | --- | --- |
| Inicio | What needs attention now, and why? | Portfolio and priority queue |
| Cartera | Where is exposure concentrated? | Administration and building |
| Facturas | What financial evidence supports the balance? | Invoice and ledger-derived state |
| Casos | What human work should happen next? | Operational case and recommendation |
| Importaciones | What was interpreted safely and what needs review? | Import batch, document, candidate |

## Drill-down paths

Inicio links prioritized cards into case detail. Cartera groups balances by administration and opens an entity workspace containing buildings, contacts, invoices, and cases. Facturas opens invoice evidence and related cases. Casos opens reasons, blockers, evidence, and bounded next action. Importaciones opens review detail without pretending that a candidate is confirmed truth.

## Comprehension conventions

- Currency is displayed in Argentine pesos while calculations remain integer cents.
- Status badges use text as well as color.
- Review, dispute, and missing-contact states are visually distinct from routine overdue work.
- Evidence references remain visible at the point where a conclusion is explained.
- Dense tables are horizontally scrollable on small screens; navigation becomes a compact horizontal strip.

## Explicit non-goals

No charts infer causality, no aging bucket claims collectability, no recommendation silently becomes an external action, and no unresolved association is presented as confirmed.
