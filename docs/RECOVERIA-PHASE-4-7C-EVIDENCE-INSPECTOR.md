# RecoverIA Phase 4.7C — Universal Evidence Inspector

## Product rationale

RecoverIA operators need to move from a claim or state to its supporting evidence and original source without leaving the workflow where the question arose. The Evidence Inspector provides that contextual path while preserving the existing full document route for deeper analysis.

The interaction model is:

`claim or state → why → evidence → original source`

## Reusable architecture

`EvidenceInspectorProvider` is mounted once around the existing application shell. Any surface can render an `EvidenceReference` for a synthetic invoice identifier; the provider owns the single dialog instance, selected document, focus restoration, and dismissal behavior. It resolves the existing synthetic invoice and passes the existing `DocumentExtraction` model into the shared `DocumentViewer`.

This keeps document semantics centralized. No Case-specific, Cartera-specific, or Agent-specific inspector was introduced.

## Entry points

- Case detail invoice references open the Inspector instead of navigating away by default.
- Cartera account-detail invoice references use the same Inspector.
- Deterministic Agent payment answers carry explicit synthetic invoice identifiers and render the same restrained evidence reference.
- `Ver documento completo` performs explicit deep navigation to `/facturas/[invoiceId]`.

## Provenance interaction

The existing FACT / INFERENCE / UNKNOWN vocabulary remains authoritative. Selecting or focusing a supported FACT or INFERENCE activates the corresponding region in the synthetic document. UNKNOWN fields clear any active region and explain: `No se encontró un dato explícito en el documento.` No source rectangle is fabricated for payment status or current balance.

The nominal document total remains a FACT about the document and is explicitly labelled as different from current debt. Current balance remains UNKNOWN when it cannot be established from the document.

## Desktop and mobile behavior

At 1440 × 1000 the Inspector occupies approximately 55% of the viewport, leaving the originating workspace visible beneath a restrained scrim. Its document preview and structured extraction panel remain side by side. Zoom controls support 75–150%, plus `Ajustar` at 100%.

At 390 × 844 and the tablet breakpoint, the Inspector becomes a full-screen sheet and the preview and structured fields stack vertically. The sheet has its own scrollable body and creates no horizontal page overflow.

## Accessibility

The Inspector uses modal-dialog semantics with an accessible title, visible close control, Escape dismissal, initial focus on Close, a contained Tab cycle, and focus restoration to the triggering reference. Evidence references are native buttons and extracted fields support pointer, focus, Enter, and Space interaction. Focus indicators remain visible. Animations are brief and disabled under `prefers-reduced-motion: reduce`.

## Synthetic boundary and adapter point

The implementation reads only the existing synthetic showroom model and CSS-drawn document representation. It contains no storage integration, database access, provider call, email path, or real PDF rendering. The stable boundary for a future real-document adapter is the existing `DocumentExtraction` input accepted by `DocumentViewer`; a later adapter can supply document bytes and provenance without changing Case, Cartera, or Agent entry points.

## Visual and interaction QA

Rendered Chromium QA covered Case → Inspector, Cartera → Inspector, Agent multi-turn → Inspector, FACT selection/highlighting, UNKNOWN explanation, 125% zoom, Escape, visible Close, deep navigation, mobile Agent → Inspector, and tablet behavior. Case decision state and Agent conversation state survived open/close. All tested viewports had document width equal to viewport width, and the browser console reported no warnings or errors.

Screenshots are stored only in the ignored local directory `.next/qa/phase-4-7c/final/` and contain synthetic data.

## Known limitations

- The preview remains a CSS-drawn synthetic financial document, not a real PDF renderer.
- The showroom has no asynchronous document-loading failure state because all synthetic fixtures are bundled and resolved synchronously.
- Provenance regions demonstrate the intended interaction but do not yet carry real page coordinates or parser-version payloads.
