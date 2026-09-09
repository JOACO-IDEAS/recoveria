# RecoverIA

RecoverIA is an isolated B2B SaaS experiment for accounts-receivable and collections operations. It turns invoice evidence into structured receivables, explainable work queues, and human-approved follow-up. It is not ConcilIA and shares no codebase, database, deployment, or production environment with it.

## Phase 4.7 status

This repository now also contains a responsive, synthetic-data product surface over the deterministic portfolio intelligence, evidence-grounded prioritization, bounded Attention-of-Today service, and import review pipeline. It does **not** contain production-grade broad PDF/XLS parsing, OCR, an Agent, communications, legal automation, real customer data, or cloud infrastructure. Phase 4.6 remains intentionally unexecuted.

## Local checks

Requirements: Node.js 20+, npm, and (only for later database work) PostgreSQL.

```bash
npm install
npm run check
```

Copy `.env.example` to `.env` only for local development and replace placeholders locally. Never commit `.env` files.

## Documents

- [Product thesis](RECOVERIA-PRODUCT-THESIS.md)
- [Architecture](RECOVERIA-ARCHITECTURE.md)
- [Domain model](RECOVERIA-DOMAIN-MODEL.md)
- [Ingestion design](RECOVERIA-INGESTION-DESIGN.md)
- [First value journey](RECOVERIA-FIRST-VALUE-JOURNEY.md)
- [Security boundaries](RECOVERIA-SECURITY-BOUNDARIES.md)
- [Phase plan](RECOVERIA-PHASE-PLAN.md)
- [ConcilIA pattern audit](RECOVERIA-CONCILIA-PATTERN-AUDIT.md)
- [Phase 1 data model](RECOVERIA-PHASE-1-DATA-MODEL.md)
- [Synthetic truth set](RECOVERIA-SYNTHETIC-TRUTH-SET.md)
- [Aging policy](RECOVERIA-AGING-POLICY.md)
- [Evidence model](RECOVERIA-EVIDENCE-MODEL.md)
- [Prioritization contract](RECOVERIA-PRIORITIZATION-CONTRACT.md)
- [Phase 2 ingestion](RECOVERIA-PHASE-2-INGESTION.md)
- [Parser architecture](RECOVERIA-PARSER-ARCHITECTURE.md)
- [Synthetic document corpus](RECOVERIA-SYNTHETIC-DOCUMENT-CORPUS.md)
- [Import review contract](RECOVERIA-IMPORT-REVIEW-CONTRACT.md)
- [Phase 2 metrics](RECOVERIA-PHASE-2-METRICS.md)
- [Phase 3 entity resolution](RECOVERIA-PHASE-3-ENTITY-RESOLUTION.md)
- [Entity identity policy](RECOVERIA-ENTITY-IDENTITY-POLICY.md)
- [Human decision memory](RECOVERIA-HUMAN-DECISION-MEMORY.md)
- [Temporal relationships](RECOVERIA-TEMPORAL-RELATIONSHIPS.md)
- [Phase 3 metrics](RECOVERIA-PHASE-3-METRICS.md)
- [Phase 4.7 product surface](RECOVERIA-PHASE-4-7-PRODUCT-SURFACE.md)
- [UI information architecture](RECOVERIA-UI-INFORMATION-ARCHITECTURE.md)
- [Case workspace](RECOVERIA-CASE-WORKSPACE.md)
- [Product comprehension](RECOVERIA-PRODUCT-COMPREHENSION.md)
