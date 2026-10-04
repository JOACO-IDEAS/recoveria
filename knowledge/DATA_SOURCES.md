# Data sources

See [INVARIANTS.md](INVARIANTS.md) for the underlying rule (documentary truth vs. accounting truth) this file operationalizes, and [ARCHITECTURE.md](ARCHITECTURE.md) for how the Drive side is actually wired today.

## Google Drive

**Role: documentary truth.**

- PDFs/documents — the original source files.
- Documentary provenance — page/coordinate-level evidence for every extracted field.
- Incremental document detection — `IncrementalCorpusProcessor` + `DriveSourceCheckpoint` own unchanged-reuse, content-change, processing-version-change, rename, and removal semantics. Removal means "absent from the active source projection"; it never deletes accounting records or asserts payment state.

What it can never supply: outstanding balance, payment status, reconciled debt, collectibility, prescription, or legal status. If a surface is about to show one of those derived from a Drive-only source, that's a bug, not a product decision — see [INVARIANTS.md](INVARIANTS.md).

## Catedral

**Role: future accounting/operational truth** (not yet connected).

- Balances.
- Payments.
- Receipts.
- Allocations.
- Credit/debit notes.
- Structured client/consorcio/administration data, where available directly from Catedral rather than reconstructed from documents.

**Preferred architecture: Catedral connects directly to Recoveria for structured data.** A `Catedral → Drive → Recoveria` export/re-import path is a fallback transport mechanism only (for whatever structured data genuinely can't be gotten any other way) — it is not the preferred logical architecture, and reaching for it first should be treated as a sign the direct-connection design hasn't been done yet, not as the normal path.

Catedral integration is Phase 9+ in [ROADMAP.md](ROADMAP.md) — explicitly after Client Zero Read-Only proves the documentary side alone.

## RecoverIA

**Role: joins sources, derives operational state, never fabricates missing source truth.**

- Joins documentary evidence (Drive) with accounting evidence (Catedral, once connected) at the entity/invoice level.
- Derives projections (balances, aging, priorities) only from append-only ledger entries with an explicit `asOf` and policy version — never by reading a document total directly as a live balance.
- When a link in the evidence chain (see [INVARIANTS.md](INVARIANTS.md)) is missing, the gap is shown as `UNKNOWN`, never silently filled from the adjacent source.

## Why this split matters for Phase 8

Phase 8 (Client Zero Read-Only) only has the Drive/documentary side available. That is exactly why Phase 8's own invariant is strict: the UI must show document facts, candidate entity relationships, and confidence — and must explicitly *not* claim unpaid/outstanding/overdue/legally-claimable/payment-status, because none of that evidence exists yet without Catedral. See [CLIENT_ZERO_READINESS.md](CLIENT_ZERO_READINESS.md) point 7 for the exact Product Surface success criterion this implies.
