# RecoverIA Phase 4.7B — Visual QA and product polish

## Scope and method

The local Phase 4.7 product surface was rendered in the Codex in-app Chromium browser against the existing Next.js development server. Visual inspection used real screenshots, controlled viewport sizes, and the synthetic showroom dataset only. No production deployment, database, provider, email, Client Zero, or ConcilIA system was accessed.

## Viewport matrix

| Class | Viewport | Coverage |
| --- | --- | --- |
| Desktop | 1440 × 1000 | Full route audit and critical before/after captures |
| Tablet | 768 × 1024 | Inicio responsive layout |
| Mobile | 390 × 844 | Inicio, case detail, document viewer, Agent, and navigation |

Screenshots are kept locally under `.next/qa/phase-4-7b/`, an ignored build-output directory. They contain synthetic data only and are not committed.

## Routes inspected

- `/`
- `/cartera`
- `/cartera/adm4`
- `/casos`
- `/casos/case-b01` (standard)
- `/casos/case-b02` (payment claim)
- `/casos/case-b04` (dispute)
- `/casos/case-b08` (legal-review threshold)
- `/facturas/i15` (UNKNOWN due date)
- `/facturas/i17` (installment INFERENCE)
- `/agente`
- `/configuracion`

## Findings

The existing visual system was coherent and restrained. Inicio reads as an attention inbox rather than a generic KPI dashboard. Tables remain dense but legible. Case detail preserves the intended sequence from recommendation through facts, unknowns, evidence, and human decision. Dispute, payment-claim, promise, and legal-review states remain semantically distinct. The document split view, confidence tags, evidence disclosure, and Agent workspace are understandable and consistent with the rest of the product.

Two rendered issues warranted correction:

1. The payment-claim banner mixed English into the Spanish product copy: `awaiting verification`.
2. The document extraction panel displayed the nominal total as the internal integer cent value (`1800000`) rather than a localized business-facing amount.

## Corrections and before/after rationale

- Replaced the mixed-language payment state with `Pago informado — pendiente de verificación`. This preserves the existing awaiting-verification semantics while making the operator-facing state unambiguous in Spanish.
- Formatted nominal invoice totals as localized ARS currency after converting cents to units. The field now reads `$ 180.000`, while its note still explicitly distinguishes nominal invoice total from current balance.
- Added focused regression assertions for both presentation guarantees.

The required desktop and mobile critical screens were recaptured after the corrections. The payment claim remains attention-colored and visibly different from confirmed payment. The nominal total now matches surrounding business-facing monetary formatting without changing fixture values or balance semantics.

## Functional and responsive verification

Rendered-browser checks covered navigation, case filtering and sorting, a human-decision interaction, communication-preview preparation, document-field highlighting, and a two-turn Agent conversation. The preview remained unsent and explicitly required approval/revalidation. Agent answers retained HECHO/DESCONOCIDO distinctions.

At 390 px, the primary navigation remains usable, layouts collapse without horizontal page overflow, the case banner remains legible, the document viewer stacks its panes, and Agent suggestions/conversation remain accessible. At 768 px, Inicio retains clear hierarchy and a practical two-column attention layout. Measured document width equaled viewport width on all four required mobile routes.

## Remaining limitations

- Screenshots exercise the synthetic document representation, not real invoice imagery.
- Tablet coverage is a practical responsive spot check rather than a second full route matrix.
- Browser QA used the development runtime; the Next.js developer indicator is not part of the production UI.

