# Product thesis

Full historical detail: `RECOVERIA-PRODUCT-THESIS.md`, `RECOVERIA-PRODUCT-COMPREHENSION.md`, `RECOVERIA-DOMAIN-MODEL.md`, `RECOVERIA-FIRST-VALUE-JOURNEY.md`, `RECOVERIA-UI-INFORMATION-ARCHITECTURE.md`, `RECOVERIA-CASE-WORKSPACE.md`. This file distills what's durable; those files carry the reasoning and the full domain model detail.

## What RecoverIA is not

- Not invoice OCR. Extraction is a means, not the product.
- Not a generic CRM.
- Not a generic chatbot.
- Not a legal-automation bot.
- Not an ERP / general-ledger replacement — it is an operational inbox that may integrate with systems of record later, not recreate them.

## Thesis

Accounts-receivable teams do not primarily need another accounting system. They need an operational layer that assembles fragmented evidence, exposes uncertainty, identifies the next reviewable work, and preserves human authority. RecoverIA turns invoice documents and collection history into a traceable receivables workspace without inventing facts or acting externally on its own.

## Core operating model

```
documents → invoices → entities → balances/evidence → cases → priorities → actions
```

Longer-term surface sequence (navigation, not strictly a build order):

```
facturas → cartera → prioridades → conversaciones → seguimiento → promesas → disputas → recupero → revisión legal
```

## North star

**"Recoveria sabe qué sabe, de dónde lo sacó y cuándo no está seguro."**

Every extracted, normalized, or recommended fact points to its source and transformation. Raw, normalized, and confirmed are separate states — a human correction adds provenance, it never rewrites history. See [INVARIANTS.md](INVARIANTS.md) for the enforced version of this.

Longer-term direction: Recoveria operates routine work for a busy business owner and asks for human attention only on genuine exceptions. **Phase 8 remains read-only** — this direction is the destination, not something Phase 8 implements.

## Users and jobs (from `RECOVERIA-PRODUCT-THESIS.md`)

- Collection operator: find and work the most important review items without reconstructing history manually.
- Finance lead: understand outstanding balance, aging, concentrations, and data-quality gaps.
- Manager: inspect why an item was prioritized and whether follow-up happened.
- Reviewer: confirm uncertain extraction/entity matches and correct them without erasing source evidence.
- Future legal reviewer: inspects configurable flags and underlying evidence; the product never determines a universal prescription deadline.

## Product principles

1. Evidence before assertion.
2. Raw, normalized, and confirmed are separate states.
3. Human authority is structural: the system may read, extract, classify, match, explain, prioritize, draft, and prepare — it may not send, threaten, negotiate, accept terms, or initiate legal action without an explicit later-gated capability.
4. Explainability beats a mysterious score — priorities expose the applicable signals and their values, never an opaque aggregate.
5. Operational inbox, not ERP.
6. Tenant isolation and auditability begin with the first persisted row.
7. Cost follows document type: deterministic parsing first, OCR only when required, probabilistic extraction only where justified.

## Information architecture

Primary navigation: Inicio, Cartera, Facturas, Casos, Contactos, Importaciones, Agente, Configuración.

| Area | Operator question | Primary object |
|---|---|---|
| Inicio | What needs attention now, and why? | Portfolio and priority queue ("Atención de hoy") |
| Cartera | Where is exposure concentrated? | Administration and building |
| Facturas | What financial evidence supports the balance? | Invoice and ledger-derived state |
| Casos | What human work should happen next? | Operational case and recommendation |
| Importaciones | What was interpreted safely and what needs review? | Import batch, document, candidate |

Explicit non-goals for this layer: no chart infers causality, no aging bucket claims collectability, no recommendation silently becomes an external action, no unresolved association is presented as confirmed. Full detail: `RECOVERIA-UI-INFORMATION-ARCHITECTURE.md`.

## Client Zero hypothesis (Christophersen Ascensores)

The first useful outcome for the real client is **not** automated collection. It is a trustworthy answer to: what is outstanding, how old is it, who appears responsible, which records are uncertain, and what should a person review first. Phase 8 exists to prove invoices can be parsed and resolved into administrations/consorcios with visible evidence and confidence — nothing more. See [CLIENT_ZERO_READINESS.md](CLIENT_ZERO_READINESS.md) for the exact readiness gate before any real data is touched.
