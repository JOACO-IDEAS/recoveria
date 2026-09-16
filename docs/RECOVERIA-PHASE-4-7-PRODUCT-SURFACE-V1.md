# RecoverIA Phase 4.7 — Product Surface V1

## What this phase is

Phase 4.7 evolves the existing RecoverIA demo (the app already live at the
Vercel demo baseline, e.g. `/casos/case-b08`) into a coherent B2B
receivables-operating surface. It does not restart the frontend, does not
redesign the backend, and does not touch `.private/client-zero/`. Every
number in the synthetic dataset that earlier phases' tests already assert
(`totalOutstandingCents`, `totalOverdueCents`, attention ordering, etc.)
stays exactly as it was — this phase only *adds* screens, interactions, and
a showroom-only data overlay on top of the existing product.

## Information architecture

Primary navigation: **Inicio → Cartera → Casos → Documentos → Agente**, with
**Configuración** as a secondary/settings entry. "Documentos" is the renamed
"Facturas" route (`/facturas`) — the URL and existing links were preserved;
only the label and the detail page's framing changed, so no existing link in
the app broke. "Importaciones" is no longer a top-level nav item (per the
requested IA) but remains fully reachable via a call-to-action on the
Documentos list page and its own URLs are untouched.

Primary journey: **Inicio → Caso → Evidencia/Cuenta → Documento → Próxima
acción → Vista previa de comunicación → Decisión humana.**

## Design principles carried into this phase

1. Invoice existence ≠ current balance — enforced structurally: the
   Document Viewer's "Estado de pago" and "Saldo actual" fields are always
   `UNKNOWN` at the per-document level, regardless of what the ledger
   separately reconstructs.
2. FACT / INFERENCE / UNKNOWN is the extraction-confidence vocabulary
   (Document Viewer). DOCUMENTADO / RECONSTRUIDO / NO DETERMINADO is the
   account-level balance-provenance vocabulary (Cartera, entity detail).
   These are deliberately two distinct vocabularies for two distinct
   questions ("how confident is this extracted field" vs. "how was this
   balance arrived at").
3. A payment claim is never visually or programmatically collapsed into a
   confirmed payment. `PaymentClaim.status` is a literal `"AWAITING_VERIFICATION"`
   type, never `"CONFIRMED"`, and the decision panel's confirmation copy for
   a claim explicitly states the balance does not change until a bank
   imputation exists.
4. A dispute pauses routine collection, visibly. `decisionOptionsForCase`
   never returns `PREPARE_FOLLOW_UP` for a disputed case, and the case page
   renders an explicit pause banner.
5. Legal review is a review flag, not legal action. The "Qué no sabe
   RecoverIA" panel states this explicitly for the legal-review case
   (`case-b08`), and no attention label anywhere says a legal action was
   taken.
6. AI (the Agent) explains; it does not decide. It distinguishes FACT
   (HECHO), INFERENCE (INFERENCIA) and UNKNOWN (DESCONOCIDO) in its answer
   text and never upgrades an unverified claim to a confirmed fact.

## Synthetic-data boundary

Nothing in this phase touches `.private/client-zero/`, Client Zero
filenames, real names, CUITs, addresses, or amounts. The Phase 4.7 showroom
overlay (`src/lib/demo/case-workspace.ts`, `document-extraction.ts`,
`agent.ts`) adds new *presentation-layer* narrative — a payment claim, an
installment-relationship inference, a due-date-unknown document, a
balance-quality classification, a deterministic Agent — entirely on top of
the **existing, already-tested** synthetic truth set
(`src/test/fixtures/synthetic-truth-set.ts`, unchanged). No ledger amount,
invoice total, or attention ordering asserted by earlier phases' tests was
modified. A dedicated test (`product-surface-v1.test.ts`) greps every new
file for Client Zero identifiers.

Any CUIT shown in the Document Viewer is a fully synthetic, deterministic
placeholder (`syntheticCuit()` in `document-extraction.ts`) generated from
the synthetic administration id — never derived from or resembling a real
tax identifier.

## Implemented screens

- **Inicio (`/`)** — rebuilt around "¿Qué necesita mi atención hoy?":
  Requiere atención (existing `attentionOfToday` grid), Próximas acciones
  (cases with a next step that didn't make today's top-priority cut),
  Actividad reciente (derived only from real case events + the one
  illustrative payment claim), and a secondary, visually de-emphasized
  metrics strip at the bottom.
- **Cartera (`/cartera`, `/cartera/[entityId]`)** — added a "Calidad del
  saldo" column/badge (DOCUMENTADO / RECONSTRUIDO / NO DETERMINADO) and an
  entity-level "Reconstrucción" section showing which invoices are clean,
  which required combining ledger movements, and which are still pending
  resolution.
- **Casos (`/casos`, `/casos/[caseId]`)** — case detail now has: the
  existing recommendation section, a dispute pause banner where applicable,
  a payment-claim state card where applicable, promise state cards
  (active/missed, visually distinct from claim/confirmed/dispute), a new
  "Qué sabe / qué no sabe RecoverIA" two-panel section, and the
  `CaseDecisionPanel` client component filling in what was previously a
  reserved placeholder (`decision-reserve`) — offering contextual human
  decisions (Revisar evidencia, Confirmar, Rechazar, Solicitar información,
  Preparar seguimiento) that only update session-local React state.
- **Documentos (`/facturas`, `/facturas/[invoiceId]`)** — the detail page
  now opens with a split-view Document Viewer: a CSS-drawn synthetic sheet
  on the left, extracted fields with FACT/INFERENCE/UNKNOWN tags on the
  right. Hovering/clicking/focusing a field highlights the corresponding
  mock region — no OCR animation, no real PDF.
- **Comunicación (embedded in Case Detail)** — triggered from the decision
  panel's "Preparar seguimiento" action. Shows Canal, Destinatario,
  Contexto autorizado, Borrador (editable locally), Evidencia utilizada, and
  an explicit safety note that a real send requires revalidation. Aprobar /
  Editar / Cancelar only change local component state.
- **Agente (`/agente`)** — a conversational console (`AgentConsole`) with
  suggested questions and free text input, backed by a deterministic
  intent-matcher (`answerAgentQuestion`) over the existing demo model. No
  external AI API call. Multi-turn: each answer is appended to the
  conversation, and case-referencing answers render clickable chips into
  `/casos/[id]`.
- **Configuración (`/configuracion`)** — workspace info, a link back to
  Importaciones, and a plain-language note that the Client Zero boundary is
  enforced elsewhere and not queried from this view.

## Interactive behaviors

Case decision panel (local state, no persistence), communication preview
approve/edit/cancel (local state), Document Viewer field-hover/click
highlighting (local state), Agent multi-turn conversation (local state),
plus all pre-existing interactivity (Cartera/Casos/Facturas filters and
sorts, the intelligent-import wizard) unchanged.

## Safety semantics enforced by tests

`src/lib/demo/product-surface-v1.test.ts` asserts, among other things: a
document's balance/payment-status fields are always `UNKNOWN`; every
payment claim's status is `AWAITING_VERIFICATION`; disputed cases never
offer `PREPARE_FOLLOW_UP`; the case page renders the pause banner text for
disputes; the legal-review case's unknown-list explicitly states review is
not legal action; every communication preview is marked
`requiresRevalidation: true` and is never serialized with a `SENT`/
`DELIVERED` status; the decision panel and showroom data layer contain no
`fetch`/provider-SDK calls; the Agent's payment answer always contains
"DESCONOCIDO" and never claims a claim is confirmed; and no new file
contains a Client Zero identifier.

## Known limitations

- The Communication Preview and Agent are **not** wired to the real
  `communication-preparation` / `communication-execution` modules reviewed
  in earlier phases — those modules require a durable execution boundary,
  a database-backed store, and a provider adapter that this showroom has no
  legitimate reason to fabricate. The preview faithfully represents that
  safety *model* (authorized recipient, authorized facts, mandatory
  revalidation) with synthetic, deterministic data instead.
- Visual QA in this pass was structural (HTML output over a locally built
  production server, `curl`-verified per route/scenario) and code review
  against the existing CSS design system — no pixel-level browser
  screenshots were taken, since no browser/screenshot tool is available in
  this environment.
- The synthetic dataset does not yet include a `CREDIT`/`WRITE_OFF` ledger
  scenario or a fully-closed "success story" case; the "successful
  recovery" narrative on Inicio is instead derived from the real,
  already-existing per-invoice payment entries.
- `Importaciones` is reachable but no longer a first-class nav item, per
  the requested information architecture.

## Future connection points to the real backend

- Swap `buildCommunicationPreview`/`CaseDecisionPanel`'s "Preparar
  seguimiento" flow for the real `communication-preparation` draft/validate
  pipeline once a demo-safe way exists to run it without a live database.
- Swap the Agent's deterministic matcher for a real LLM-backed tool-use
  loop that still calls into the same read-only demo/domain functions,
  preserving the FACT/INFERENCE/UNKNOWN contract.
- Feed the balance-quality classification from the real
  `collection-interactions`/`contact-relationships` modules once the
  frontend data layer is wired to a live database instead of the synthetic
  truth set.
