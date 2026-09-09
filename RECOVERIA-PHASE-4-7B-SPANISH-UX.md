# RecoverIA Phase 4.7B — Spanish Product UX Redesign

## Objective

Redesign the Phase 4.7 product surface into a fully Spanish, human-readable,
visually polished B2B operational product — without changing any deterministic
Phase 1–4 business semantics, without introducing new domain logic, and without
any dependency on real (Client Zero) data.

## Codex → Claude handoff

Codex implemented most of Phase 4.7B and hit its usage limit mid-session. The
handoff was audited before any further work: git status, file mtimes, the full
test suite, and every route/component were inspected to determine exact scope
completed versus outstanding. No Codex work was discarded or reset. On resuming,
113/113 tests, TypeScript, ESLint, and the production build were already green.
Two gaps were found and closed:

- Synthetic fixture display names (`Consorcio Sintético N`, `Contacto Sintético N`)
  leaked technical/demo terminology into rendered business data. Renamed to
  realistic placeholder Argentine addresses/labels — display-string only, no
  IDs, amounts, or business logic touched.
- The Cartera, Facturas, Casos, and Importaciones list pages rendered only a
  fixed-width desktop `<table>`. On a 390px viewport this forced horizontal
  scrolling that hid exactly the columns the spec calls out as essential —
  on Casos specifically, Situación, Qué hacer, and Prioridad were pushed off
  screen. A parallel mobile card layout was added for all four pages (see
  "Responsive card solution" below).
- Follow-up polish: on narrow mobile viewports the sidebar nav's last item
  ("Importaciones") was visually cut off by the horizontal scroll boundary.
  Fixed by tightening mobile nav padding/font-size so all five nav items fit
  within a 390px viewport without scrolling or truncation.

## Centralized Spanish presentation layer

All enum-to-label translation lives in `src/lib/demo/presentation.ts`. Routes
and components import only label functions (`priorityLabel`, `attentionLabel`,
`invoiceStatusLabel`, `importStatusLabel`, `formatLabel`, `promiseLabel`,
`agingLabel`, `eventLabel`, `ledgerLabel`, `reviewReasonLabel`, `documentLabel`,
`fieldStatusLabel`, `filterOptions`) — no component performs its own ad hoc
translation or string mangling. Labels use natural Argentine business Spanish,
not mechanical enum transliteration (e.g. `VERIFY_PROMISE` → "Promesa
incumplida", with supporting explanation "La fecha comprometida de pago ya
pasó", not "Verificar promesa").

## Internal-enum leakage prevention

Every internal enum/taxonomy value (priority tiers, attention types, invoice
states, import states, formats, promise states, aging buckets, ledger/event
types, review reasons, field statuses) is routed through the presentation
layer before reaching JSX. A dedicated regression test
(`src/lib/demo/spanish-product-ux.test.ts`) asserts every attention/priority
pair surfaced by the domain layer translates to something other than its raw
enum value, and that a fixed leak list (CRITICAL, HIGH, OVERDUE, PDF_NATIVE,
etc.) never appears as a rendered invoice status. A manual grep across all
route and component source at handoff and after every subsequent change
confirmed zero matches.

## Internal-ID leakage prevention

No route concatenates or renders a raw entity/case/document ID as visible
label text. IDs are used only for `key`/`href` routing. Verified by grep
(`\.id}` outside `key=`/`href=` attributes returns no matches) and by visual
QA screenshots of every list and detail page.

## UX redesign

- Persistent shell with a deliberate dark-green identity, serif financial
  headline typography, and a demo-mode indicator ("Datos de demostración").
- Inicio leads with the four questions a collections operator asks first:
  total pendiente, total vencido, facturas vencidas, and "Prioridades de hoy"
  as the central operational section.
- Aging presented as the seven required buckets (Al día, 1–30, 31–60, 61–90,
  91–180, 181–365, Más de 1 año), reconciling to total outstanding.
- Cartera, Facturas, Casos, and Importaciones use plain business-facing page
  copy and Spanish filters/statuses exactly as specified.
- Detail pages (entity, invoice, case, import review) use progressive
  disclosure: headline business answer first, reasoning next, raw evidence
  behind a collapsed "Ver evidencia" disclosure — never dumped up front.

## Responsive card solution

Cartera, Facturas, Casos, and Importaciones each render two markups from the
same computed row data: a `<table>` (class `table-only`) for desktop/tablet,
and a stacked card list (class `card-list cards-only`) that becomes visible
below a 700px breakpoint while the table hides. Cards are ordered to surface
entity, amount, problem, and action first, matching the spec's mobile
priority order — no data is dropped on narrow viewports, and no business
logic is duplicated (both markups read the same pre-computed array).

## Accessibility / focus behavior

Active navigation uses a dedicated green background/underline treatment, not
the browser's default focus ring. Keyboard focus (`:focus-visible`) is styled
independently on links and disclosure summaries, so tab-order accessibility
is preserved regardless of the active-nav styling. Card links inherit the
same focus treatment as their table-row equivalents.

## Validation results (at approval)

- 113/113 tests passing across 8 test files (`vitest run`).
- `tsc --noEmit`: no errors.
- `eslint .`: no errors.
- `prisma validate`: schema valid.
- `next build --webpack`: production build succeeds, 7 app routes generated.
- Visual QA performed at desktop (1440px) and mobile (390px) for all 10
  routes (Inicio, Cartera, entity detail, Facturas, invoice detail, Casos,
  case detail, Importaciones, import review) using synthetic data only, with
  zero browser console errors.

## Client Zero safety status

No file under `.private/client-zero/` was opened, read, parsed, or modified
during this phase. All displayed data originates from
`SYNTHETIC_TRUTH_SET` / the synthetic document corpus. Phase 4.6 (real Client
Zero ingestion) remains paused pending the real Christophersen Ascensores
invoice sample.

## Remaining known limitations

- The Next.js dev-mode indicator visible in local screenshots is dev-only
  chrome and does not appear in production builds.
- No further UX gaps were identified; the product surface is considered
  complete for Phase 4.7B scope.
