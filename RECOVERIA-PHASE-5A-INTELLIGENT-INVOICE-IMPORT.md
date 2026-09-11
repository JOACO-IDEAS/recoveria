# RecoverIA Phase 5A — Intelligent Invoice Import

## Scope and safety

Phase 5A adds a product-facing import workspace over the approved Phase 2 deterministic parsers and duplicate detector. It uses only the synthetic fixture corpus under `src/test/fixtures`; it does not read, list, search, copy, or process Client Zero material. No network service, model API, OCR expansion, credential, email, WhatsApp, or ConcilIA integration is present.

The public Vercel demo is not deployed or modified by this phase.

## User flow

`Importaciones → Importar facturas` opens a four-step workspace:

1. Select an authorized synthetic document.
2. Inspect classification, extraction, normalization, source values, and field status.
3. Review missing, ambiguous, contradictory, duplicate, scanned, or unsupported outcomes and make an explicit human decision where possible.
4. Approve into an isolated in-browser demo view, or close/reject without incorporation.

The scenario library covers successful native PDF parsing, missing fields, ambiguous and contradictory fields, exact and possible duplicates, scanned PDFs, and unsupported documents. The existing corpus also continues to cover CSV and XLSX in the underlying batch and test suite.

## Persistence model

Phase 5A deliberately does not persist approvals. A resulting invoice exists only in React component state and disappears on reload or navigation. The result clearly says this and the canonical Phase 1–4 portfolio, invoice, ledger, case, and KPI data remains unchanged.

## Architecture

`DocumentUnderstandingProvider` is the narrow future provider boundary. Its only implementation is `DeterministicDocumentUnderstandingProvider`, which delegates to the approved `ImportOrchestrator`. The interface accepts tenant scope, idempotency key, documents, and entity catalog, and returns the established `ImportBatchResult` contract. This makes a later provider replaceable without pretending AI exists today.

The server constructs serializable scenario views; the client receives no document bytes and owns only ephemeral decisions. Tenant isolation remains enforced by the orchestrator before parsing.

## Human decisions

- Accept the suggested interpretation.
- Choose a candidate explicitly.
- Leave entity resolution unresolved.
- Reject the document.

Unsupported, failed, and scanned-only inputs cannot be approved. Exact and possible duplicates remain visible and require a decision. Missing or ambiguous values are never silently filled.

## Verification

The Phase 5A suite checks successful parsing, missing fields, ambiguity, contradiction, exact and possible duplicates, scanned and unsupported routing, all decision outcomes, tenant isolation, unchanged canonical totals, absence of Client Zero paths, and absence of external providers. Full repository validation includes lint, TypeScript, Vitest, Prisma generation/validation, production build, security preflight, and local desktop/mobile browser QA.
