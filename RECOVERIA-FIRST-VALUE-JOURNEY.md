# RecoverIA First Value Journey

## Controlled experiment

1. An authorized owner creates the “Christophersen Ascensores” workspace; no production integration is implied.
2. Before Phase 9, use only synthetic invoices. At Phase 9, a separately approved, minimal historical sample enters through a documented real-data gate.
3. Operator creates an import, sees validation limits and data-handling notice, then uploads the batch.
4. Import screen reports queued/parsed/needs-review/failed/duplicate counts and per-document evidence.
5. Reviewer corrects fields and confirms or rejects proposed administrations, consorcios, and debtors. Raw evidence remains visible.
6. Once required decisions are complete, the system materializes invoices and receivable entries with an explicit as-of time.
7. `Cartera` shows totals per currency, overdue amount, aging buckets, oldest receivables, largest debtors, and missing-contact cases. Every aggregate drills into included records.
8. `Inicio` presents “Atención de hoy” grouped by reason: old/large balances, uncertain matches, missing contacts, stale cases, or due promises.
9. User asks “¿Qué debería revisar primero?” The structured query layer returns eligible items and explicit signals; the explanation layer verbalizes only those values.
10. User reviews an item and records a decision. No message is sent and no legal conclusion is made.

## Explainability contract

A recommendation includes `asOf`, scope/filter, ordered items, applicable signal values, missing-data caveats, policy version, and evidence links. Example: “Revisaría este caso primero: ARS 120.000 pendientes, 143 días de atraso y sin contacto registrado. El contacto podría estar incompleto.” The system must omit any clause whose fact is unavailable.

## Acceptance criteria

- Re-importing the same batch is idempotent or visibly flagged.
- A reviewer can compare raw, normalized, and confirmed values.
- No unresolved identity is presented as confirmed.
- Portfolio totals reconcile to receivable entries and list their as-of time/currency.
- Aging boundary tests are deterministic.
- Every recommended item explains its ordering with explicit signals.
- Tenant A cannot access Tenant B through UI, API, job, export, or object key.
- No outbound communication action exists.

## Initial screens

- **Inicio:** operational inbox and explainable review reasons.
- **Importaciones:** batch creation, progress, failures, and evidence review.
- **Facturas:** structured invoice table with source and confidence.
- **Cartera:** balances, aging, concentration, and data gaps.
- **Contactos/Casos:** placeholders until later workflow phases.
- **Agente:** deferred; eventual structured query interface, not open-ended chat.
- **Configuración:** tenant settings and later configurable aging/legal-review policies.

## Instrumentation

Capture import completion rate, per-field correction rate, unresolved/false-match rate, time to review, ledger reconciliation errors, and percentage of recommendations with complete evidence. Do not use collection recovery as a Phase 1–4 success metric.
