# Trust, Evidence, Case Workspace, Import Workspace

These three surfaces are where RecoverIA's core claim — "sabe qué sabe, de dónde lo sacó y cuándo no está seguro" — either becomes real or becomes a slogan. This file governs all three together because they share one mechanism: the four-level disclosure model.

## The four-level disclosure model

Every piece of interpreted information in RecoverIA sits at exactly one of four levels. An operator should never have to go deeper than they want, and raw/internal material must never leak above its level.

| Level | Name | Contains | Styling |
|---|---|---|---|
| **1** | Business answer | What the operator needs to know, stated in plain Spanish ("Revisar disputa," "$ 810.000 pendientes") | Editorial or Operations typography per the surface's mode — this is the headline content, always visible by default |
| **2** | Reasoning / explanation | Why RecoverIA believes it ("La factura registra una disputa," "Superó el umbral configurado para revisión humana/legal") | Operational sans, `--fact` accent where the explanation states a confirmed interpretation, `--attention` where it states uncertainty — always visible by default, directly under the Level 1 answer |
| **3** | Supporting evidence | Human-readable source information (which invoices, which events, which document) | Operational sans, quiet/muted background, **behind an explicit disclosure toggle** ("Ver evidencia") — never open by default |
| **4** | Raw provenance | Internal identifiers, raw source references (`doc:i11`, internal document IDs, un-normalized field values) | Provenance mono (see `typography.md`), **only reachable by opening Level 3 first** — never skips straight from Level 1/2 to raw identifiers |

### The hard rule this model exists to enforce

**A raw normalized/internal value must never appear above Level 4.** The audited example — `ADMINISTRACION GARCIA SRL` (the internal matching-normalized form) displayed as if it were the confirmed customer-facing answer — is exactly the violation this model prevents. The customer-facing display value (`Administración García SRL`, properly cased) belongs at Level 1/2. The raw normalized string, if it needs to be shown at all (e.g. to explain *why* a match was made), belongs at Level 4, in provenance mono, behind the same evidence toggle as everything else at that level.

This applies everywhere interpreted values are shown: invoice detail, case detail, and especially the import workspace's field-review step, where extraction naturally produces both a human value and a normalized/raw one.

## Case Workspace rules

Case Detail is Editorial mode and will likely become RecoverIA's primary daily surface, so its container hierarchy must be exact:

- **Recommendation is the Recommendation archetype** (see `containers-and-status.md`), always the single heaviest-weight element on the page — stated as a sentence, in editorial serif, with its Level 2 reasoning directly beneath it in operational sans.
- **Financial exposure is the Financial Summary archetype** — one number, prominent, tabular figures, not sharing a KPI-grid treatment with anything else on the page.
- **Facts** (dispute status, promise status, invoice count) render per the status-kind table in `containers-and-status.md` — most of them are text + accent, not badges, except priority tier.
- **History** is a Reading Section — chronological, calm, Level 1/2 content only, with its own Level 3 evidence disclosure per event.
- **Invoices involved** is a compact list, Operations-flavored even inside this Editorial page (it's a scan-many-rows moment nested inside an understand-one-thing page) — money right-aligned, tabular, minimal chrome.
- **The future decision/action zone must be visually reserved now, even while empty.** Do not implement communications or decision-recording in this phase. Do give the layout an explicit, labeled space (e.g., a closing section headed "Próxima acción" or similar, even if its only content today is a quiet placeholder) so a future feature has a natural home instead of being bolted on as an awkward third column later. This is a layout-reservation requirement, not a feature-building one.

## Import Workspace rules

The import wizard (`Documento → Interpretación → Revisión → Resultado`) is the most complex flow in the product and the one most at risk of reading as a parser debugger instead of a business workflow. It must not look like: a parser/debug console, a developer console, or an "AI extraction playground."

- **Business result before technical pipeline.** On the interpretation step, the field values (número, importe, vencimiento, administración) lead; any pipeline/process visualization (clasificado → extraído → normalizado → listo) is secondary — smaller, positioned after or below the fields, never the first thing the operator reads.
- **Human-readable values before normalization, always.** Per the disclosure model above: the properly-cased display value is what's shown as "the value"; the raw normalized form is Level 4 material, reachable only through an explicit "ver origen"/evidence affordance, never sitting next to a "Confirmado" pill as if it were the confirmed answer itself.
- **Uncertainty must be visible, not hidden or softened.** "Sin propuesta," "Ambiguo," "Ausente" are stated in words, with an `--attention` or `--dataflag` accent per their kind (an ambiguous *field* is an attention-kind uncertainty; a *duplicate document* is a data-quality flag) — never silently defaulted to a blank or a guessed value.
- **Confidence is visually distinct from collections severity.** A field's extraction confidence (Confirmado/Incierto/Ambiguo/Ausente) must not reuse the priority-badge shape/tokens used for Crítica/Alta. Per `containers-and-status.md`, this is the Import review field archetype: label / value / origin / confidence-marker, using `--fact` for confirmed and `--attention`/`--dataflag` for the rest — never the priority badge component.
- **Progressive evidence disclosure applies here too.** The document's raw source text/values are Level 3/4 material — visible on request, not dumped alongside the interpreted fields by default.
- **Human decision is an explicit, named stage.** The current "Decisión humana" step (with its Decision option archetype — see `containers-and-status.md`) is the correct pattern and should be preserved and extended, not collapsed into an implicit "just click approve."
