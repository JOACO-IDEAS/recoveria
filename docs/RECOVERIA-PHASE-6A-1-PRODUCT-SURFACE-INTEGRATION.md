# RecoverIA Phase 6A.1 — Product Surface integration contract

## Decision

The committed C5B checkpoint is sufficient for the first read-only Facturas V2 and Evidence Inspector integration. No schema change or migration is required for 6A.1 or the minimum 6A.2 wiring.

The product source of truth is the single `DriveSourceCheckpoint` selected by the complete boundary `(organizationId, sourceType, sourceId, connectionId)`. Its JSON `checkpoint` is versioned independently by the row's optimistic-lock `version`. Product code must not combine it with older demo invoice fixtures.

## Durable truth audit

The durable path is:

`DriveSourceCheckpoint.checkpoint`
→ `SourceCheckpoint.entries[]`
→ `SourceCheckpointEntry.parse`
→ `DocumentParseResult.understanding`
→ normalized candidates and `observationIds`
→ `StructuredDocumentUnderstanding.observations[]`
→ document/page/region/excerpt provenance.

Persisted in checkpoint version 1:

- organization, source type, opaque source identifier, revision and cursor;
- source document identity, safe display name, MIME type, size, modified time, content fingerprint and source provenance;
- parse classification/status/review reasons and invoice candidates;
- the complete `StructuredDocumentUnderstanding`, including normalized candidates, raw documentary values, field status, FACT/INFERENCE/UNKNOWN, confidence and observation references;
- observations with document, page, region, excerpt, extraction method and parser version;
- per-document relationship candidates and processing outcome/version.

Not materialized in the checkpoint:

- corpus summary and metrics;
- exact/business duplicate findings;
- cross-document relationship proposals and unmatched signals;
- customer identity cluster proposals.

Those outputs are transient during ingestion, but are deterministically reconstructable from persisted entries. Exact duplicates use the persisted SHA-256 fingerprint. Possible business duplicates use persisted invoice candidate keys. Relationship proposals use the persisted structured understandings and the existing blocking/relationship engines. Identity clusters use persisted candidate tax ID/name/address values. These remain proposals, never confirmed entity identity.

The original PDF bytes are not persisted in the checkpoint. A browser-viewable PDF is therefore not available from the durable product read model today.

## Executable read contract

`ProductSurfaceQueryService` is the core query boundary. It depends on `ProductSurfaceCheckpointReader`, not Prisma, Drive or a provider. Every method requires a `ProductSurfaceScope` containing organization, source type, source ID and connection ID. Loaded row and every checkpoint entry are revalidated against that scope before mapping.

Queries:

- `listInvoices(scope, filters)` returns deterministic invoice/document rows;
- `getInvoice(scope, documentId)` returns one documentary detail;
- `getEvidence(scope, documentId, field)` returns the selected normalized value and supporting observations;
- `getRelationships(scope, documentId)` returns advanced proposal detail.

The normal invoice DTO intentionally contains `documentedNominalTotalCents`, never outstanding balance or amount owed. `entityCandidate` is explicitly a classified/confidence-bearing candidate, never an administration or confirmed customer. Every surfaced field preserves value, field status, classification, confidence and evidence availability.

Source IDs, source locators/root IDs, fingerprints, raw OAuth data and credentials are omitted from all product DTOs.

## Facturas V2 contract

Supported table columns today:

- document/invoice number;
- candidate entity (visibly unconfirmed when it is not FACT);
- issue date with `ISSUE_DATE` semantics;
- documented due date with `PAYMENT_DUE_DATE` semantics, without deriving overdue status;
- documented nominal total and currency;
- confidence summary;
- duplicate status;
- review-required indicator;
- source display name/type.

Supported filters today:

- text search across invoice number, source display name and candidate entity;
- issue-date range;
- documented nominal-total range;
- candidate entity;
- confidence;
- review-required;
- duplicate status;
- epistemic classification.

Explicitly unsupported/deferred:

- administration or customer as confirmed identity;
- paid/unpaid/partially paid;
- current outstanding balance or amount owed;
- overdue or aging derived from document existence/date alone;
- collectibility, prescription/limitation or legal status;
- collections/case state unless a separate authoritative subsystem is joined later.

The existing visual baseline currently contains demo-only debt, balance, aging and status semantics. 6A.2 must replace those only inside the Facturas integration with the trusted contract; it must not map the new documentary data into the old debt fields.

## Evidence Inspector contract

The default Inspector shows customer-meaningful evidence:

- source display name/type;
- selected normalized value;
- FACT/INFERENCE/UNKNOWN;
- confidence and field status;
- supporting excerpt, page and region;
- contradictions, when relevant.

Parser versions remain under the separate `technical` member for advanced support disclosure. Internal source IDs, root locators and ingestion implementation details do not belong in the normal business surface.

The Inspector interaction remains contextual: invoice row → invoice detail → selected field → evidence → close/back restores the invoice context. Relationship density is handled similarly: the row exposes only a review indicator and counts; advanced detail retrieves relevant proposals/unmatched signals. No table dumps 248 proposals.

## Source PDF recommendation

6A.2 should add an authenticated server-side, bounded document-render endpoint. It must:

1. derive organization/connection/source scope from the authenticated server session, never browser input alone;
2. resolve the document only inside the committed checkpoint and authorized root;
3. unwrap credentials server-side through the existing Secret Manager/KMS boundary;
4. retrieve only the selected source document, with no browser-visible OAuth token, source/root ID or permanent public Drive link;
5. stream a short-lived response with strict content type, size and page/render controls, no shared cache, and sanitized audit metadata;
6. revalidate root membership and the execution/security gate appropriate to a read-only viewing operation.

That endpoint is deliberately not part of 6A.1. Until it exists, the Inspector can truthfully show persisted excerpt/page/region evidence but must label the PDF preview unavailable.

## Minimum HTTP boundary for 6A.2

Add authenticated server-only handlers (route names may follow the target app convention) for:

- invoice list with allow-listed filters and bounded pagination;
- invoice detail by product document ID;
- evidence by document ID and allow-listed field name;
- relationship detail by document ID;
- optional bounded PDF/render retrieval as the separately reviewed security work above.

Handlers construct `ProductSurfaceScope` from trusted organization/connection configuration and use a Prisma-backed implementation of `ProductSurfaceCheckpointReader`. They must not accept an arbitrary organization, source or connection override from the browser. Response schemas should be validated at the boundary. The visual repo should consume DTOs without importing Prisma or ingestion internals.

## Synthetic boundary and tenancy

6A.1 uses only the isolated synthetic pilot checkpoint. It performs no Drive/OAuth/provider operation and does not read Client Zero. The query boundary fails closed if the row, checkpoint or any entry does not match the requested organization/source/connection scope. A missing checkpoint returns an empty result; a boundary mismatch throws and must become a non-disclosing authorization/data-integrity error at HTTP level.

## Validation obligations for 6A.2

- verify response pagination and filter allow-listing;
- verify session-derived scope and cross-tenant denial;
- preserve FACT/INFERENCE/UNKNOWN and confidence visually;
- label the amount “Importe nominal documentado”, never “Saldo”;
- label entity values as candidates unless independently confirmed;
- keep review/duplicate states distinct and contextual;
- preserve Inspector context on close;
- test desktop/mobile accessibility and empty/unknown states;
- keep the approved navy/light visual language and progressive disclosure;
- do not merge the C5B checkpoint with legacy demo fixtures.

## Carried-forward C5B P2 items

- P2-1: retry-capable transport composition guard.
- P2-2: checkpoint-commit versus terminal execution timing window.

They remain mandatory before the next real Drive run, but do not block read-only Product Surface work and were not changed in 6A.1.
