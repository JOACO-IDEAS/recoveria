# RecoverIA Phase 4.6B.2 — Source-agnostic corpus intelligence

## Objective

This phase turns the existing per-document invoice intelligence into a corpus pipeline without changing its accounting meaning. It discovers documents from an authorized source, preserves their origin, routes them through the existing understanding provider, and composes duplicate, identity, relationship, contradiction, and abstention results into one operational report.

It does not reconstruct current balance, infer payment status, assert debt or collectability, persist production data, send communications, or connect an external provider.

## Architecture

The implemented flow is:

`DocumentSource → discovery/fingerprint → semantic document classification → DocumentUnderstandingProvider → normalization/provenance → duplicate detection → identity clustering → relationship intelligence → corpus report`

The following existing components are reused unchanged:

- `DeterministicDocumentUnderstandingProvider` and `ImportOrchestrator`
- PDF/container classification and local native-PDF decoding
- normalized observations with page, region, extraction method, parser version, raw value, normalized value, confidence, and semantic classification
- `DuplicateDetector`
- `proposeCustomerIdentityClusters`
- `proposeDocumentRelationships`
- existing FACT / INFERENCE / UNKNOWN semantics and contradiction statuses

The new components are deliberately small:

- `DocumentSource` describes source identity, discovered-document metadata, content access, and provenance.
- `LocalFolderSource` performs deterministic recursive discovery, skips symlinks, identifies supported PDFs, and gives each document a tenant/source/locator-derived stable identifier.
- `CorpusProcessor` fingerprints bytes, creates a corpus-level idempotency key, invokes the configured understanding provider, and aggregates trust-aware results.

## Classification and trust

Container classification remains separate from semantic classification. The existing parser decides whether bytes are a supported native/scanned PDF or unsupported input. After document understanding, the corpus layer classifies only evidence-backed `FACTURA`, credit-note, or debit-note labels. Everything else remains `UNKNOWN_DOCUMENT`; it is never forced into an invoice category.

The corpus report preserves:

- **FACT:** documentary observations such as explicit invoice identity or nominal total.
- **INFERENCE:** proposed relationships and inferred periods/stages; never promoted merely because confidence is high.
- **UNKNOWN:** absent fields, unresolved identities, and unknown document types.
- **CONTRADICTION:** hard identity or relationship conflicts retained as reviewable results.
- **Confidence:** HIGH, MEDIUM, LOW, or UNAVAILABLE counts plus the original per-field value.
- **Provenance:** source adapter, source identifier, source document identifier, source locator, content fingerprint, document/page/region, extraction method, parser version, raw value, and normalized value where available.

Invoice existence still proves neither current debt nor payment state. No output field represents current balance or payment allocation.

## Corpus output

The report includes discovered, processed, unsupported, invoice-classified, and unknown document counts; exact and possible duplicates; identity clusters; unresolved identities; relationship proposals; contradictions; review items; confidence totals; abstentions; failures; incomplete core fields; and identity conflicts. It also retains the source record, parse result, identity proposals, and relationship evidence for inspection.

## Private Client Zero validation

The existing authorized 20-PDF corpus was processed read-only through `LocalFolderSource` and `CorpusProcessor`. The detailed output was written only inside the ignored private analysis boundary. Sanitized aggregates were:

- 20 discovered and 20 processed
- 20 classified as invoices; 0 unknown or unsupported
- 0 exact duplicates and 0 possible business duplicates
- 7 identity clusters; 0 unresolved identities and 0 identity-cluster conflicts
- 229 relationship proposals
- 140 contradiction results
- 199 review-required aggregate items
- 9 abstentions
- 0 unparsed documents and 0 documents with incomplete core fields
- confidence observations: 240 HIGH, 119 MEDIUM, 0 LOW, 126 UNAVAILABLE

No filename, tax identifier, address, invoice number, amount, or source content is included in this tracked document.

## Scale and performance

A generated 64-document synthetic corpus passes discovery and end-to-end processing, proving the architecture is not specialized to 20 files. Discovery, hashing, parsing, and grouping are linear in corpus size aside from the current pairwise relationship engine. Relationship analysis is explicitly reported as `O(n²)` and should be narrowed by strong identity/series keys before processing production corpora around or above 1,000 documents. Distributed infrastructure is not warranted yet.

## Future source adapters

A future `GoogleDriveSource` should implement only the `DocumentSource` contract: enumerate source documents, provide stable Drive provenance/metadata, and lazily return bytes. Downstream classification, understanding, normalization, duplicate detection, clustering, relationships, and reporting remain unchanged. OAuth, Drive API calls, paging, rate limits, and incremental change tokens are intentionally outside this phase.

An `UploadSource` can use the same boundary for manually supplied content.

## Future Catedral evidence

Catedral accounting evidence answers a different question: what happened after an invoice was issued. A future adapter should produce accounting events with their own provenance and feed reconciliation/balance logic outside this document corpus processor. Invoice evidence must not be silently treated as payment allocation, current balance, or collectability.

## Known limitations

- Only PDF is intentionally supported by `LocalFolderSource` in this phase.
- Scanned PDFs still route to the existing explicit offline-OCR review state.
- The deterministic parser recognizes the validated invoice vocabulary; unsupported document categories abstain.
- Relationship generation remains pairwise and should be indexed before very large production runs.
- The source interface is ready for Drive, but no Google authentication or API adapter exists.
