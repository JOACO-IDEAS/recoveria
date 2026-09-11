---
name: recoveria-product-design
description: RecoverIA's design system doctrine — Editorial Financial for understand/decide surfaces, Modern Operations for scan/operate surfaces. Load before writing or reviewing any RecoverIA UI (JSX/TSX in src/app, src/components) or any globals.css change. Prevents drift into generic AI-SaaS dashboard styling.
---

# RecoverIA Product Design — Visual System V2

Load this skill before touching any RecoverIA UI: React components under `src/app/**` or `src/components/**`, or `src/app/globals.css`. It governs *how things look*, not business logic — domain services in `src/lib/domain`, `src/modules/*` remain authoritative and untouched by anything in this skill.

This is the approved direction as of Phase 5A.5, decided against baseline commit `8123008`. It does not itself change any code — it is the contract that future visual implementation work must follow.

## The core product principle

Every visual decision in RecoverIA must serve one sentence:

> **"RecoverIA sabe qué sabe, de dónde lo sacó y cuándo no está seguro."**

Concretely, the design system must let an operator tell apart, at a glance, six different kinds of content:

| Kind | What it is | Visual treatment |
|---|---|---|
| **FACT** | A verified, ledger-backed value (an invoice total, a due date) | Plain text, high contrast, tabular figures. Never a badge. |
| **INTERPRETATION** | A machine-derived reading of ambiguous evidence (a normalized entity match) | Text + a quiet "fact/confidence" accent (see `references/color.md`), always paired with the human-readable form, never the raw normalized string. |
| **UNCERTAINTY** | RecoverIA doesn't know, or isn't sure | Amber/attention accent, explicit words ("Sin propuesta," "Ambiguo"), never silently blank. |
| **BLOCKER** | Work cannot proceed without a human decision | Callout container with a critical/attention left-accent, always says what and why. |
| **RECOMMENDATION** | What RecoverIA suggests doing next | First-class visual citizen — its own container archetype, never sharing weight with surrounding cards. |
| **HUMAN DECISION** | What a person actually chose to do | Reserved visual zone, present even when empty (see `references/trust-evidence-case-import.md`). |

If a design choice can't be justified against this table, it doesn't belong in RecoverIA.

## The contextual model: two modes, not one aesthetic

RecoverIA is not one look. It is two disciplined modes, applied by *what the surface is for*, never mixed on the same screen.

### Mode 1 — UNDERSTAND / DECIDE → **Editorial Financial**

Inicio, Case Detail, Invoice Detail, Administración Detail, any recommendation or evidence-interpretation surface.

Feel: calm, premium, explanatory, confident. These are *reading* surfaces — the operator is being told something and needs to trust it, not scan a list quickly.

### Mode 2 — SCAN / OPERATE → **Modern Operations**

Cartera, Facturas, Casos, Importaciones — any working list or table.

Feel: dense, fast, precise, high-signal. These are *doing* surfaces — the operator is scanning many rows to find the one that matters.

### How to classify a new surface

Ask: *is the operator here to understand one thing deeply, or to scan many things quickly?* One thing deeply → Editorial. Many things quickly → Operations. A single page may contain both (e.g., Case Detail's headline recommendation is Editorial; if it ever grows an inline invoice table, that table is Operations) — the mode is per-*section*, not strictly per-*route*.

## Brand and color — the one rule that matters most

**Green is RecoverIA's identity. Green must never again mean five different things.** Today it simultaneously means brand, success, confirmation, navigation, and (implicitly, by being the only positive color) fact/confidence. That conflation is why the product feels generic under the hood. Full token table, hex values, and usage rules: **`references/color.md`**. Read it before choosing a color for anything.

## Quick anti-pattern checklist

Reject a design or a diff on sight if it does any of these — each one is a documented regression this system exists to prevent:

- [ ] A new container is `border + border-radius + box-shadow`, matching every other card, with no regard for which of the 8 container archetypes it actually is (`references/containers-and-status.md`).
- [ ] A new status is rendered as a pill/badge without checking whether it's a priority tier (badge is correct), a case fact, a review flag, a process state, or a data-quality flag — each has a *different* required treatment (`references/containers-and-status.md`).
- [ ] Four (or any N) identically-sized KPI boxes in a row as the primary way to present a dashboard's numbers. Inicio's hierarchy is one headline number + subordinate metrics, not a grid of equals (`references/financial-and-tables.md`).
- [ ] Arial, or the system sans stack, or Inter, used as if it were a considered choice rather than a default. RecoverIA's operational sans is IBM Plex Sans; its editorial serif is Source Serif 4 (`references/typography.md`).
- [ ] A raw normalized/internal string (`ADMINISTRACION GARCIA SRL`, `doc:i11`, an internal ID) rendered anywhere above Level 4 of the disclosure model (`references/trust-evidence-case-import.md`).
- [ ] A hover, press, or focus state whose visual delta wouldn't survive being screenshotted before/after and compared side by side. If you can't see the difference in two static screenshots, it isn't a state (`references/interactions-responsive-qa.md`).
- [ ] Gradients, glassmorphism, neon accents, decorative icons, "AI-powered" badges, chatbot-style bubbles, excessive centered whitespace, or any layout that reads as a marketing page rather than operational software.
- [ ] Money, a count, or a date rendered in the same typographic style as prose body text, with no tabular-figure treatment (`references/typography.md`, `references/financial-and-tables.md`).
- [ ] A table on a working surface (Cartera/Facturas/Casos/Importaciones) styled with Editorial Financial padding/typography instead of Modern Operations density.
- [ ] A reading surface (Inicio/Case/Invoice/Entity detail) styled as densely as a table, losing the calm/explanatory register Editorial Financial requires.

## Reference index

| File | Covers |
|---|---|
| `references/typography.md` | Editorial serif vs. operational sans vs. numeric/tabular rules, exact font stack, sizes, weights, licensing |
| `references/color.md` | Full semantic token table, hex values, the brand/success/fact/attention/critical/data-flag separation |
| `references/containers-and-status.md` | The 8 container archetypes; the status-system decision table (badge vs. text vs. icon vs. row-accent) |
| `references/financial-and-tables.md` | Money typography and hierarchy; the Modern Operations table system (density, alignment, sort, sticky header, mobile transform, pagination threshold) |
| `references/trust-evidence-case-import.md` | The four-level disclosure model; Case Workspace container rules; Import Workspace rules (business-result-first, confidence ≠ severity) |
| `references/interactions-responsive-qa.md` | Interaction states (hover/press/selected/focus/disabled/blocked/review-required/approved/uncertain); responsive rules; the mandatory visual QA loop and route set |

Each reference file is self-contained enough to open on its own, but all of them serve the two-mode model and the six-kind trust table defined above — when in doubt, come back to those two things.
