# Color

RecoverIA keeps its dark-green identity. It does not get a rebrand. What changes is *discipline*: today one green does five unrelated jobs (brand, success, confirmation, navigation, and — by default, since nothing else exists — fact/confidence). Visual System V2 separates those jobs into distinct, named tokens.

## The rule

**A color token's name is its only allowed meaning.** If you need green for something that isn't literally "RecoverIA's brand identity," you need a different token — not a lighter or darker shade of the same one used loosely.

## Semantic token table

| Token | Approx. value | Meaning — and *only* this meaning | Used on |
|---|---|---|---|
| `--ink` | `#18221c` (keep) | Primary text | Everywhere |
| `--muted` | `#667168` (keep) | Secondary/caption text | Everywhere |
| `--line` | `#dfe4df` (keep) | Hairline borders/dividers | Everywhere |
| `--ground` | `#f4f5f2` (keep) | Page background, Operations mode | Cartera, Facturas, Casos, Importaciones |
| `--paper` | `#ffffff` (keep) | Surface background, Operations mode | Table wraps, working cards |
| `--paper-warm` | `#faf8f3` (new) | Surface background, Editorial mode | Inicio, Case/Invoice/Entity detail reading sections |
| `--brand` | `#235d46` (keep — current `--green`) | RecoverIA identity **only**: logo mark, sidebar background family, active-nav indicator, primary button fill | Sidebar, primary actions, brand mark |
| `--brand-deep` | `#14271d` (keep — current `--green-dark`) | Sidebar background | Sidebar only |
| `--success` | `#2f6b52` (new — distinct from `--brand`, same family, different token) | A resolved/positive *fact*: paid invoice, closed case with no issue | Estado="Pagada"/"Al día", never reused for nav or buttons |
| `--fact` | `#3c5c78` (new — slate-blue, outside the green/amber/red triad) | A verified or machine-confirmed value the operator should trust *as a fact* — e.g., a field marked "Confirmado" in the import review, an evidence citation's accent | Import review field status, Level-2 "why RecoverIA believes it" accents |
| `--attention` | `#8b5a18` / soft `#fbf2df` (keep — current `--amber`) | Uncertain, needs a look, priority tier "Alta" | Attention badges, "Alta" priority, review-flag icons |
| `--critical` | `#8c4943` / soft `#f8e9e7` (keep — current `--red`) | Blocker, confirmed problem, priority tier "Crítica" | Blocker callouts, "Crítica" priority, disputed/blocked states |
| `--dataflag` | `#6b5b8a` / soft `#efeaf6` (new — violet, distinct from all of the above) | Data-quality flags only: posible duplicado, formato no compatible, evidencia contradictoria | Import review data-quality badges |

## Why each new token is justified

- **`--paper-warm`** exists because Editorial and Operations need visibly different surfaces, not just different typography — a warm paper tone on reading surfaces is what makes them feel calmer than the working tables, without touching the brand hue at all.
- **`--success` as distinct from `--brand`** exists because "this invoice is paid" and "this is RecoverIA's logo" are unrelated facts that today share one variable. Splitting them means a future rebrand of the identity green would never accidentally change what "paid" looks like, and vice versa.
- **`--fact`** exists because there is currently *no* color for "RecoverIA verified this" that isn't also the brand color or the success color. This is the single most important new token: it is what lets the import workspace show "Confirmado" as *a fact*, not as *brand-colored success*, which were previously and wrongly the same thing.
- **`--dataflag`** exists because a data-quality problem (possible duplicate, unsupported format) is not a collections-severity problem, and coloring both red collapses "this account might be in legal trouble" and "this file didn't parse" into the same visual alarm. They must never look the same.

## Hard rules

- `--brand` never appears on a badge, a table cell, or a status indicator. It is reserved for identity chrome (logo, sidebar, active-nav, and the primary-action button fill).
- `--success`, `--fact`, `--attention`, `--critical`, and `--dataflag` are mutually exclusive per element — one status, one token. Never blend two into a single badge for "extra emphasis."
- Every soft/background pairing (e.g., `--critical` text on `--critical`-soft background) keeps the existing pattern of a saturated foreground on a desaturated tint background — do not introduce solid-fill colored badges; the tint pattern is already correct and should be extended to the new tokens, not replaced.
- Do not add a color to this table without tracing it to one of the six trust-model kinds (FACT / INTERPRETATION / UNCERTAINTY / BLOCKER / RECOMMENDATION / HUMAN DECISION) in `SKILL.md`, or to Brand/Success as pre-existing product concepts. If it doesn't trace to one of those, it's decoration, not a semantic color, and it doesn't belong.
