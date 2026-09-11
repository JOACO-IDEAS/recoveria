# RecoverIA Phase 5A.5 — Visual System V2

## Approved direction

Visual System V2 applies **Editorial Financial** to understand/decide surfaces and **Modern Operations** to scan/operate surfaces. The authoritative contract is `.claude/skills/recoveria-product-design/` and its six reference documents.

## Typography

Source Serif 4 is self-hosted by `next/font` for the single editorial headline or hero value on a screen. IBM Plex Sans is the operational default for navigation, controls, tables and body copy. IBM Plex Mono is confined to nested raw-provenance disclosures. Money, dates, counts and percentages use tabular figures.

## Semantic tokens and containers

The implementation separates brand, success, verified fact, attention, critical, data quality, warm paper, surface, ground, border and text. Reading sections use warm paper, spacing and rules; working lists use dense rows and dividers; evidence uses progressive muted panels; blockers use critical/attention left accents; decision options have explicit selected states; financial summaries use one dominant value; recommendations carry the heaviest section accent; import fields use row-based confidence markers.

## Financial and operational surfaces

Inicio now leads with total pending exposure and demotes overdue balance, overdue invoice count and attention count to supporting metrics. Canonical values are unchanged. Cartera, Facturas, Casos and Importaciones use sticky headers, tabular right-aligned numbers, stronger sorting affordances, visible hover/focus states, dense 44px rows and reduced badge noise. Mobile continues to transform tables into cards ordered by entity, amount, problem and action.

## Status language

Priority tiers retain categorical pills. Case facts use text plus critical row/section accents. Review requirements use a diamond marker plus label. Routine process states are plain text. Duplicate, contradiction and unsupported-file signals use the violet data-quality language.

## Detail workspaces

Administration and invoice detail use Editorial Financial hierarchy: exposure first, supporting context second, related invoices/cases after. Case detail promotes the recommendation above exposure and history, separates blockers, preserves compact invoice scanning, and reserves a clearly labeled future human-action zone without adding unavailable controls.

## Trust and import workspace

Evidence follows four levels: business answer, explanation, supporting evidence, then raw provenance. Internal references and raw source strings sit only in nested Level 4 disclosures using IBM Plex Mono. Import interpretation now presents business fields before the technical pipeline; normalized uppercase matching strings are converted to human-readable Spanish display names. Field confidence is distinct from collections priority and human decision remains an explicit step.

## Responsive and interaction behavior

Hover, pressed, selected, focus, disabled, blocked, review, approved and uncertain states are visibly distinct with transitions of at most 150ms. At approximately 390px, financial values keep priority, navigation remains scrollable, tables become cards and the import document picker collapses to the selected document after step 1.

## QA and regressions

Visual QA covers Inicio, all four operating lists, administration/invoice details, critical and disputed cases, import steps 1–3, opened invoice/case evidence and the Spanish 404, plus every mobile-required state. Functional checks cover filters, sorting, cross-navigation, breadcrumbs, entity review, duplicate handling, evidence disclosure, human review and session-only approval. Fixture truth and business logic were not changed.

## Known remaining gaps

The existing synthetic scale does not require pagination or virtualization. The reserved case-action zone intentionally has no controls until a later approved product phase. No new backend behavior, communication channel or authentication surface is included.

## Adversarial audit correction pass

Case facts now derive neutral, positive, or critical presentation from the actual promise/dispute value; neutral portfolio states no longer inherit the attention-colored review flag. Confirmed and possible duplicates remain in the violet data-quality family but use visibly stronger and lighter treatments respectively. At exactly 390 × 844, all five Casos filters are reachable through the existing horizontal-scroll row. Level-4 raw values were verified—and their selector broadened where necessary—to use IBM Plex Mono without changing Levels 1–3.
