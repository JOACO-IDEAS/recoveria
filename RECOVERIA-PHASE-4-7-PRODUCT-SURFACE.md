# RecoverIA Phase 4.7 — Product Surface V1

## Scope

Phase 4.7 turns the approved synthetic domain and operational-intelligence layers into a coherent, read-only B2B product surface. It does not execute Phase 4.6, ingest real client data, send communications, automate legal action, or modify the approved domain contracts.

## Implemented surface

- A persistent shell with synthetic tenant context and five primary routes: Inicio, Cartera, Facturas, Casos, and Importaciones.
- Inicio with receivables KPIs, complete aging reconciliation, and Attention-of-Today cards.
- Portfolio, entity, invoice, and case workspaces with links that preserve investigative context.
- Import summary and review-required detail driven by the Phase 2 orchestrator.
- Responsive navigation, cards, tables, detail grids, semantic status badges, and restrained professional styling.

## Architectural rule

React routes consume `demoModel` and `importDemo`. Those presentation adapters call the approved Phase 1 ledger/aging/portfolio functions, Phase 2 import orchestrator, and Phase 4 portfolio/prioritization/attention services. Routes render outputs; they do not reproduce business thresholds or decision logic.

## Safety boundary

All displayed data comes from synthetic fixtures. The product surface has no dependency on Client Zero paths, credentials, production infrastructure, or ConcilIA. Explanations expose evidence references and uncertain entity associations remain marked for review.

## Validation

The Phase 4.7 regression suite verifies financial reconciliation, aging totals, Phase 4 queue reuse and ordering, evidence-grounded reasons, ledger-derived invoice states, entity rollups, tenant isolation, Phase 2 review states, route/domain separation, and the absence of Client Zero path dependencies.
