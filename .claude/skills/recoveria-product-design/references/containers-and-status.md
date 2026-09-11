# Containers and Status

Two related regressions, one file: "everything is the same rounded card," and "every status is a pill." Both come from the same root cause — reaching for one generic component instead of asking what kind of thing is actually being shown.

## The 8 container archetypes

Every piece of RecoverIA UI is one of these eight things. None of them look like each other. If a new piece of UI doesn't obviously fit one, stop and ask which mode (Editorial/Operations) it's in and what kind of content it holds before inventing a ninth.

| # | Archetype | Mode | Where it appears | Shape rules |
|---|---|---|---|---|
| 1 | **Reading section** | Editorial | Inicio's aging/priorities sections, Case/Invoice/Entity detail's explanatory blocks | Generous padding, `--paper-warm` background, a top rule or eyebrow label instead of a full border box, serif sub-header allowed only if it's the screen's one designated headline |
| 2 | **Working list / table** | Operations | Cartera, Facturas, Casos, Importaciones | Dense, `--paper` background, hairline row dividers only (no per-row border box), sticky header, see `financial-and-tables.md` for full spec |
| 3 | **Evidence panel** | Either (styled per its disclosure level) | `Ver evidencia` disclosures on invoice/case/import | Muted background, Level 3 in quiet operational sans, Level 4 in provenance mono — see `trust-evidence-case-import.md` |
| 4 | **Blocker / callout** | Either | "Antes de continuar," import review flags | Left-border accent in `--critical` or `--attention` only (never neutral, never `--brand`), never used for informational-only text |
| 5 | **Decision option** | Editorial (it's a decide surface) | Import wizard's "Decisión humana" radio choices | Card-like but with an explicit selected-state treatment (border + subtle fill change, not just a checked radio dot) — this is the one archetype where a bordered box is correct, because the operator is choosing between discrete options |
| 6 | **Financial summary** | Editorial | Inicio's headline number, Case Detail's exposure | One hero number in editorial serif (see `typography.md`), supporting metrics in operational sans below/beside it — never four equal boxes |
| 7 | **Recommendation** | Editorial | Case Detail's "Próximo paso," Inicio's priority cards | Heavier visual weight than every other container on the same screen — a distinct top-accent plus the one serif headline the screen is allowed; never shares a border/shadow treatment with neighboring cards |
| 8 | **Import review field** | Operations (it's inside a scan/decide hybrid, but field rows are scanned) | Import wizard's field-by-field interpretation step | Row-based, label / value / origin / confidence-marker, tabular figures for numeric values, confidence marker per `trust-evidence-case-import.md` — never a severity-style badge |

**The rule this table enforces:** a bordered-rounded-shadowed rectangle is *one specific archetype* (Decision option), not the default wrapper for everything. Reading sections use whitespace and rules, not boxes. Tables use row dividers, not per-row boxes. If you're about to wrap something in `border + border-radius + box-shadow` and it isn't a Decision option, check this table first.

## The status system

Nine states were audited (Crítica, Alta, En disputa, Promesa incumplida, Requiere revisión, Identidad por confirmar, Procesado, Sin procesar, Posible duplicado). They fall into four different *kinds*, and each kind gets a different treatment — this is the codified fix for "everything is a pill."

| Kind | Examples | Treatment | Why |
|---|---|---|---|
| **Priority tier** (categorical severity) | Crítica, Alta, Media, Baja | **Badge** — the only kind that keeps the pill. Uses `--critical`/`--attention` tokens. | This is genuinely categorical and benefits from a fixed, instantly-recognizable shape when scanning a list fast. |
| **Case fact** | En disputa, Promesa incumplida | **Text + row/section accent** (a colored left border on the row or card, plus the fact stated in words) — no separate pill | These are facts about the account, not a severity classification. Giving them a pill duplicates the priority badge's visual language and competes with it for attention. |
| **Review flag** | Requiere revisión, Identidad por confirmar | **Icon + label** (a small flag/marker glyph plus text, using `--attention`) — not a filled pill | A review flag is closer to "this needs a checkbox" than "this is dangerous." Using the same pill shape as Crítica overstates it. |
| **Process state** | Procesado, Sin procesar | **Plain text** (`--muted` for the routine case, `--attention`/`--critical` text-only for the exception) — no badge at all | These appear on nearly every row of Importaciones. A badge on every single row is pure noise; text carries the same information without competing for attention. |
| **Data-quality flag** | Posible duplicado, Formato no compatible, Evidencia contradictoria | **Its own badge, `--dataflag` token, distinct shape/tone from priority badges** | A duplicate-document warning and a Crítica collections case must never look like the same kind of alarm. See `color.md` for why `--dataflag` exists. |

### Hard rule

Before styling any new status value, classify it against this table first. If it's genuinely new and doesn't fit one of the four kinds, that's a real design question to raise — not a reason to default to "add another pill."
