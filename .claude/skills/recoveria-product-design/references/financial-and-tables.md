# Financial Values and Tables

Money is the product's central subject and must visually outrank the chrome around it. Tables are where operators spend most of their day and must be built for speed, not decoration. Both are governed by Modern Operations discipline even when they appear on an otherwise-Editorial page.

## Financial value hierarchy

- **One hero number per screen, maximum.** Inicio's total pendiente, or a Case Detail's exposure figure — set in editorial serif at hero size (see `typography.md`). Every other number on that same screen is subordinate: operational sans, tabular figures, smaller.
- **Reject the four-equal-KPI-box pattern.** The old Inicio layout (Saldo pendiente / Saldo vencido / Facturas vencidas / Atención hoy as four identically-sized boxes) is the single most recognizable "generic AI dashboard" trope in the product and is retired. The replacement: one large headline number (total pendiente) with the other three metrics demoted to a horizontal caption row beneath or beside it — clearly subordinate, not competing.
- **Weight, not color, signals importance within a table row.** A money cell is one weight step heavier than its row's descriptive text, same family, same or one size step larger. Color is reserved for status (see `containers-and-status.md`), never used to make a number itself feel "more important."
- **Percentages get real weight.** "98% del saldo vencido" is a serious fact; it does not default to the smallest caption size on the page just because it happens to be phrased as a supporting detail. Size it in proportion to what it actually means, not to its grammatical role in the sentence.
- **Negative/critical amounts stay legible first.** Severity is shown by the surrounding container/accent (row-left-border, callout, badge — see `containers-and-status.md`), never by degrading the number's own legibility (no red-on-red, no reduced contrast, no strikethrough tricks).
- **Every money value, date, and count uses tabular figures** (`font-variant-numeric: tabular-nums`), full stop — see `typography.md`.

## The Modern Operations table system

Applies to Cartera, Facturas, Casos, Importaciones, and any future working list. Reading-surface tables (if any ever appear inside a Case/Invoice detail) still follow these mechanics but may relax padding slightly to match the surrounding Editorial rhythm — the *mechanics* below are non-negotiable either way; only spacing may flex.

| Property | Rule |
|---|---|
| **Row height (default)** | 44px, enough for a primary line + secondary metadata line |
| **Row height (dense mode)** | 36px, primary line only, secondary metadata shown on demand (e.g. hover or a detail view) — dense mode becomes the default once a table's row count regularly exceeds ~50 |
| **Header height** | 40px, sticky (`position: sticky; top: 0`) on every working table over one viewport tall — headers must never scroll away, confirmed as a real gap in the pre-V2 tables |
| **Numeric alignment** | Right-aligned, tabular figures, in their own column — never centered, never left-aligned |
| **Primary/secondary cell pattern** | A cell may carry two lines: the primary value (e.g. entity name) in full weight, a secondary line (e.g. building name) directly beneath in `--muted`, smaller — this pattern already exists in the product and should be systematized, not reinvented |
| **Sort affordance** | Visible arrow indicator on the active sort column at all times (not just on hover); clicking a sortable header toggles ascending/descending; unsorted sortable columns show a neutral double-arrow affordance so the operator knows sorting is available before touching anything |
| **Hover** | A perceptible background shift on the row (not the near-invisible tint used pre-V2) — must pass the "screenshot before/after and see the difference" test from `interactions-responsive-qa.md` |
| **Selected row** | Reserved for future multi-select/bulk-action work — not implemented yet, but the visual language (a distinct left-border accent + background tint, never the same treatment as hover) should be designed alongside the rest of the table system so it doesn't get bolted on awkwardly later |
| **Keyboard focus** | Independent from hover/selected — a visible focus ring on the focused row/cell when navigating by keyboard, styled distinctly from both, consistent with the product's existing (correct) practice of separating focus rings from active-nav styling |
| **Row actions** | Appear on hover/focus only (e.g. a quick-open arrow), never permanently visible as a cluttering extra column when the primary link (entity name, invoice number) already provides navigation |
| **Filter treatment** | Pill-style filter buttons above the table (the existing Facturas/Casos/Importaciones pattern) — this already works and should be extended to any new filterable list, not redesigned |
| **Status column** | Follows the status-kind table in `containers-and-status.md` — not every status column entry is a badge |
| **Mobile transformation** | Below ~700px, the table becomes a stacked card list (the existing `.table-only`/`.cards-only` pattern) — each card leads with entity, then amount, then problem, then action, per the product's own mobile-priority principle; never force a horizontal-scrolling table on a phone |

## The pagination/virtualization threshold

**Not implemented in Phase 5A.5.** But the rule for *when* it becomes mandatory is defined now so nobody has to re-derive it later:

- A working list rendering **more than ~150 rows** in one unpaginated page, or
- A working list whose full render measurably degrades interaction responsiveness (typing in a filter, clicking a sort header) on typical hardware,

is the trigger to add pagination or virtualization. Below that threshold, the current "render everything, let the browser scroll" approach is acceptable and should not be prematurely engineered around. At the audited synthetic scale (6 administrations, 12 cases, 30–40 invoices/documents) this threshold is nowhere close, and no work should be done toward it until real or scaled data approaches it.
