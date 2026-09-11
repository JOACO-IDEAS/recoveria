# Typography

Two type families, one strict division of labor, plus a numeric mode that cuts across both. No third family. No "just this once" exceptions.

## The division of labor

| Role | Family | Used for | Never used for |
|---|---|---|---|
| **Editorial serif** | Source Serif 4 | Major page headlines (Inicio, Cartera, Casos, etc. `<h1>`), major financial headline numbers where the number *is* the message (Inicio's total pendiente, a case's exposure), recommendation statements framed as sentences ("Revisar la disputa de Administración Río SRL") | Table body, buttons, badges, forms, navigation, metadata, filters, labels, evidence/provenance text |
| **Operational sans** | IBM Plex Sans | Navigation, tables, forms, controls, filters, labels, body text, secondary metadata, KPI captions, badge text | Page-level headlines, hero financial numbers, recommendation sentences |
| **Provenance mono** | IBM Plex Mono | Level 3/4 evidence disclosure only (raw references, source document IDs, internal identifiers) — see `trust-evidence-case-import.md` | Anything a first-time operator reads without deliberately opening a disclosure panel |

**Why these two (three) families, not Georgia/Arial or Inter:**
- Source Serif 4 (Adobe, SIL Open Font License) reads as *institutional/editorial* — closer to a well-typeset financial publication than Georgia's heavier, more decorative letterforms — and is safely self-hostable with no licensing fragility.
- IBM Plex Sans (IBM, OFL) has genuine engineered character (it was designed for IBM's own enterprise software) instead of being the anonymous default every AI-assisted build reaches for. It is explicitly *not* Inter, which is called out as an anti-pattern in its own right.
- IBM Plex Mono is the family match for Plex Sans, so provenance/evidence text feels like a deliberate "technical register," not an unrelated leftover monospace.
- All three ship complete, variable-friendly weight ranges and can be self-hosted (no runtime dependency on a third-party font CDN), consistent with RecoverIA's no-external-services posture.

## Serif usage rules

- Serif appears **at most once per screen's primary hierarchy** — one `<h1>`, or one hero number, or one recommendation sentence. If a screen has three serif headlines fighting for attention, that screen has a hierarchy problem, not a typography problem.
- Serif size range: 28–40px for page `<h1>`, 40–56px for a hero financial number (Inicio total pendiente, case exposure), 20–24px for a recommendation sentence framed as a statement.
- Serif is never bold-and-small at the same time — if it's small enough to compete with body text, it should not be serif.
- Serif section sub-headers inside cards (today's "Facturas involucradas," "Trabajo relacionado" pattern) are **downgraded to operational sans, semibold** — this was the single biggest source of "every card looks like a blog post" in the pre-V2 product. Reserve serif for the *one* thing per screen that deserves editorial weight.

## Operational sans usage rules

- Base body size: 14px, line-height 1.5, weight 400. Table/list body: 13–14px, weight 400–500 for primary cell content.
- Labels, eyebrows, badge text, table headers: 10–11px, letter-spacing ~0.06–0.13em, weight 700–800, uppercase where already established (e.g. "CARTERA," "PARA RESOLVER" eyebrows) — keep this existing pattern, it already works.
- Never let operational sans exceed ~24px except as a KPI/table numeric value (see numeric rules below) — large sans headlines are the generic-dashboard tell this system exists to avoid.

## Numeric / tabular rules

Money, dates, counts, and percentages are **information, not prose**, and must be typographically distinct from surrounding text so the eye can jump straight to them.

- Apply `font-variant-numeric: tabular-nums` (IBM Plex Sans supports true tabular figures) to every money value, date, count, and percentage, in both Editorial and Operational contexts. This is a hard rule, not a style preference — it is what makes columns of numbers actually scannable.
- Money gets its own weight step above the surrounding text it sits next to: if a table row's descriptive text is weight 400, its money cell is weight 600–700, same family, same size or one step larger — never a *different* family for emphasis (i.e., don't reach for serif to make a number "feel important" inside a table row; weight and size do that job without breaking the mode).
- On Editorial reading surfaces (Inicio, Case Detail), the *one* hero number per screen may use the editorial serif at hero size (see above) — every other number on that same screen, including the supporting metrics next to it, stays in operational sans tabular figures. This is the specific mechanic behind "one primary financial headline number, with secondary metrics subordinate to it" (see `financial-and-tables.md`).
- Negative/critical financial values (e.g., a blocked or disputed amount) do not get a special numeral shape — severity is communicated by the container/accent around the number (see `containers-and-status.md`), never by making the digits themselves red, bold-red, or otherwise decorative. A number is always legible first.
- Percentages (e.g., "98% del saldo pendiente") follow the same tabular rule and are sized to match their actual informational weight — a 98%-overdue figure is a serious fact and should not be relegated to the smallest caption size on the page merely because it's currently phrased as a caption.

## What "trendy but wrong" looks like

Do not introduce a typeface, weight, or numeral style because it looks contemporary. Every typographic decision in this file traces back to one of: (a) the Editorial/Operational mode split, (b) the disclosure-level model, or (c) numeric scannability. If a proposed change doesn't trace back to one of those three, it doesn't belong.
