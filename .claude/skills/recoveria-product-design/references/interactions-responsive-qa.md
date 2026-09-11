# Interactions, Responsive Behavior, and Visual QA

## Interaction states

A state that doesn't produce a visible difference isn't a state. Every interaction below must pass the same test: **screenshot before, screenshot after, and the difference must be obvious without zooming in.** This is a direct fix for the audited pre-V2 hover states, which were real in code but imperceptible on screen.

| State | Applies to | Rule |
|---|---|---|
| **Hover** | Rows, cards, nav items, buttons, links | A clear background and/or border shift — not a few percentage points of shadow opacity. If it doesn't survive a screenshot diff, increase it. |
| **Pressed** | Buttons, filter pills, nav items | A visible darken/scale-down on `:active`, released on mouseup — animation duration ≤120ms, no bounce/spring effects |
| **Selected** | Filter pills (existing), decision options (import wizard), future table row multi-select | Distinct from hover — a persistent fill/border change that remains after the pointer leaves |
| **Focus** | All interactive elements, keyboard navigation | Always styled independently from hover and from active-nav — this is already correct in the product (a real strength) and must not regress when new components are added |
| **Disabled** | Wizard "next" buttons before a required decision, unavailable actions | Reduced contrast + `cursor: not-allowed`, but never reduced below a legible contrast ratio — disabled is not an excuse to make text unreadable |
| **Blocked** | A case/import with an active blocker | Uses the Blocker/Callout archetype's accent (`--critical` or `--attention`) consistently wherever the same underlying condition appears (list row, detail page, badge) |
| **Review-required** | Facturas/Casos/Importaciones rows, import fields | Per the status-kind table in `containers-and-status.md` — review flags get icon+label, not the priority-badge shape |
| **Approved** | Import wizard result step | A calm, resolved visual state — the current checkmark/result-mark pattern is a reasonable base; keep it understated rather than celebratory (no confetti, no bounce, no success-toast animation) |
| **Uncertain** | Import fields, entity-resolution candidates | `--attention` accent, explicit wording, never a blank or an unstyled default |

**Animation discipline:** transitions exist only to make a state change legible (e.g., a 100–150ms ease on background-color/border-color). No decorative motion — no entrance animations, no parallax, no bouncing icons, no "AI thinking" shimmer effects. If an animation doesn't help the operator notice a state actually changed, remove it.

## Responsive behavior

Desktop is the primary operational environment — RecoverIA is used at a desk, during focused daily work. Mobile must remain fully usable, not merely "not broken."

- **Table → card transformation**: below ~700px, working tables become stacked cards (existing `.table-only`/`.cards-only` pattern) — this mechanic is correct and should be preserved as-is for any new working list.
- **Mobile information priority**: every card leads with **entity → amount → problem → action**, in that order, regardless of how many columns the desktop table has. This ordering is non-negotiable — it's the one rule that made the pre-V2 mobile Casos view usable at all.
- **Financial value placement**: the amount is always visually prominent on a mobile card — never demoted below secondary metadata just because space is tight. If something has to be cut on mobile, cut metadata before cutting the number's prominence.
- **Filter behavior**: filter pills wrap or scroll horizontally on mobile; they are never hidden behind a "more filters" menu that requires an extra tap to discover on a page whose whole job is fast triage.
- **Multi-step import behavior**: the wizard's step rail compresses to numbered indicators on mobile (existing pattern), but each step's content must remain clearly separated from the scenario picker — do not let "choosing a document" and "reading the current step" blur into one undifferentiated scroll, which was an audited weakness. The scenario picker collapses (e.g., to a compact selector or a dismissible panel) once a document is chosen, rather than staying permanently expanded alongside every step's content.
- **Navigation behavior**: the sidebar's mobile transformation to a horizontal scrollable nav bar is acceptable, provided every label fits without mid-word clipping (already fixed in Phase 4.7B) — any future nav addition must be re-checked against the 390px width budget before shipping.

## Visual QA — the mandatory loop

**Every visual change, however small, goes through this loop before being called done:**

1. Restart the dev server clean (`rm -rf .next && npm run dev`) — **do not trust a long-running dev server.** During the Visual System V2 audit, a `next-server` process that had been running since before several intervening commits served stale CSS and would have produced a false "the import workspace has no styling at all" finding if it hadn't been caught by diffing the served stylesheet against source. Always verify.
2. **Verify served CSS is current**: fetch the page, extract the linked stylesheet, and grep for a class name known to have been added/changed recently. If it's missing, the server is stale — restart before doing anything else.
3. Capture desktop screenshots (1440px) of every route in the required set below.
4. Capture mobile screenshots (~390px) of every route marked mobile-required below.
5. Compare each screenshot against this skill's rules — mode (Editorial vs. Operations), container archetype, status treatment, typography, color tokens.
6. Inspect specifically for: spacing/rhythm consistency, hierarchy (is there exactly one dominant element per screen?), density (does an Operations surface feel dense, does an Editorial surface feel calm?).
7. Correct any deviation.
8. Re-capture the corrected route(s).
9. Only then, approve.

### Mandatory route coverage

| Route/state | Desktop | Mobile (~390px) |
|---|---|---|
| Inicio | ✓ | ✓ |
| Cartera | ✓ | ✓ |
| Administración detail | ✓ | — |
| Facturas | ✓ | ✓ |
| Invoice detail | ✓ | — |
| Casos | ✓ | ✓ |
| Case detail — a Crítica case | ✓ | ✓ |
| Case detail — a disputed case | ✓ | — |
| Importaciones | ✓ | — |
| Importar facturas — step 1 (Documento) | ✓ | ✓ |
| Importar facturas — step 2, a clean/consistent scenario | ✓ | — |
| Importar facturas — step 2, an ambiguous/uncertain scenario | ✓ | — |
| Importar facturas — step 3 (Decisión humana) | ✓ | — |
| An opened invoice evidence disclosure | ✓ | — |
| An opened case evidence disclosure | ✓ | — |

This list is the minimum. It exists because it's exactly the set that covers every distinct layout pattern and every disclosure-level interaction in the product — skipping any of them risks missing a regression in a pattern that isn't exercised anywhere else.
