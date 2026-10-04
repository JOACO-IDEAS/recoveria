# Invariants

These are durable product and data rules. They apply in every environment (`LOCAL`, `STAGING_SYNTHETIC`, the future `CLIENT_ZERO_READ_ONLY`, any future `PRODUCTION`) and outlive any single phase. If a change you're making would violate one of these, stop and raise it rather than quietly working around it. Sources: `RECOVERIA-DOMAIN-MODEL.md`, `RECOVERIA-EVIDENCE-MODEL.md`, `RECOVERIA-ENTITY-IDENTITY-POLICY.md`, `docs/RECOVERIA-PHASE-4-6B-REAL-DOCUMENT-UNDERSTANDING.md`, `docs/RECOVERIA-PHASE-4-6A-CLIENT-ZERO-DISCOVERY-SANITIZED.md`, `docs/RECOVERIA-PHASE-6B-1-CONNECTED-SOURCES-ARCHITECTURE.md`.

## Epistemic status is always one of four values

**FACT ≠ INFERENCE ≠ UNKNOWN ≠ CONTRADICTION.**

- **FACT** — directly observed in a source document (e.g. the printed nominal total, an issue date).
- **INFERENCE** — derived from facts plus a stated method (e.g. "these two invoices are probably installments of one project" from matching description + quotation signal). Always carries its method/confidence.
- **UNKNOWN** — not present in available evidence. Never fabricated, never silently defaulted. The UI explains *why* it's unknown ("No se encontró un dato explícito en el documento."), it doesn't just omit the field.
- **CONTRADICTION** — two pieces of evidence disagree. A contradiction outranks an otherwise-exact identifier match and forces review (`CONFLICT`), it never gets silently resolved by picking one side.

No agent — human-adjacent UI code, extraction pipeline, or future conversational layer — may silently convert an uncertain/inferred value into a fact-presented value.

## Documentary truth vs. accounting truth

- **Google Drive = documentary truth.** Existence, stated identifiers/dates, nominal stated values, candidate entities, provenance, relationships, duplicates.
- **Catedral / the real accounting system = accounting/operational truth.** Balances, payments, allocations, credit/debit notes.
- Drive never establishes outstanding balance, payment status, reconciled debt, collectibility, prescription, or legal status. See [DATA_SOURCES.md](DATA_SOURCES.md) for the source-responsibility split this implies.

## The evidence chain has required links — none may be skipped

```
INVOICE EXISTS → PAYMENT STATUS → CURRENT BALANCE → SUBSEQUENT EVENTS → CURRENT RECEIVABLE STATUS
```

Invoice documents alone support only the first link. **Invoice existence must never initialize a current outstanding balance without separate accounting evidence.** Concretely:

- `documented invoice amount ≠ outstanding balance`
- `invoice existence ≠ unpaid debt`
- A `Receivable` (outstanding amount, state, `asOf`) is a derived projection over append-only `ReceivableLedgerEntry` rows — it is never read off the invoice total directly.
- Invoice status is never inferred as paid unless payment/allocation evidence actually supports it.

## Economic value vs. legal claim

**ECONOMIC REFERENCE VALUE ≠ LEGALLY CLAIMABLE AMOUNT.**

An economic reference value (inflation/index-adjusted, etc.) requires an approved reference-date rule, currency/regime policy, index series+version, methodology, rounding policy, calculation date, and treatment of subsequent financial events — none of that is the same question as what is legally enforceable, which additionally requires prescription/chronology evidence the invoice alone never contains.

## Disputes and promises

- A noted dispute **pauses routine collection** — it is a first-class blocker, not a data point that gets overridden by balance/age.
- `payment claim ≠ confirmed payment`. A `PromiseToPay` records terms *as reported*; it is never interpreted as accepted or fulfilled automatically.
- Active promises and unresolved disputes outrank balance/invoice-count signals in the prioritization policy (see [ARCHITECTURE.md](ARCHITECTURE.md)'s precedence order) — they make follow-up unsafe, not just lower-priority.

## Human authority

- High-impact and legal actions require a human/lawyer gate. `LegalReviewFlag` requests expert review from configurable, jurisdiction-scoped rules — it never calculates a universal prescription conclusion itself.
- Drafting, approving, and sending are three distinct capabilities, enforced server-side. A communication draft has no send capability by construction; approval and send are separate, later, explicitly-gated actions.
- The system may read, extract, classify, match, explain, prioritize, draft, and prepare. It may not send, threaten, negotiate, accept terms, or initiate legal action without a separate, explicit capability grant beyond Phase 8's scope.

## Tenant isolation

Every tenant-owned row and query is organization-scoped. A request derives organization access from authenticated membership, never from an untrusted client-supplied ID. Compound uniqueness (e.g. CUIT) is tenant-scoped, not global — two different tenants can legitimately have overlapping business identifiers. Cross-tenant access requires a separate, audited support path, never a query bypass.

## Provider reads must be bounded and attributable

Every provider read (Drive today, Catedral/others later) is root-bounded, tenant-scoped, and produces an attributable execution record (who/what triggered it, when, what was read). No open-ended or unscoped provider access exists anywhere in the design.

## No synthetic fallback in real surfaces

A Client-Zero-or-later real-data surface must never silently fall back to synthetic/fixture data on error, missing config, or partial failure. Fail closed and say so; never paper over a real-data gap with a synthetic value that looks the same in the UI.

## Identity resolution precision over recall

Only two deterministic auto-resolution paths exist (see [ARCHITECTURE.md](ARCHITECTURE.md)); everything else requires human review. Similar-but-not-exact names never silently merge. This is a deliberate precision-over-recall choice, not a limitation to "fix" by loosening matching.

## Immutability and append-only history

Source documents, extraction runs/fields, resolution evidence/decisions, ledger entries, and collection events are historical records. Corrections append and may *supersede* a prior record; they never overwrite or delete the original observation.
