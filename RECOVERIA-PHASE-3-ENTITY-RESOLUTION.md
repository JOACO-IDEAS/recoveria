# RecoverIA Phase 3 Entity Resolution

Phase 3 implements an offline deterministic resolver for Administration, Building, and Party identity signals. Inputs are tenant-scoped normalized signals with source references. Outputs are `RESOLVED`, `REVIEW_REQUIRED`, `AMBIGUOUS`, `NO_MATCH`, or `CONFLICT`, with candidates, supporting/contradicting evidence, stable reason codes, and a human-decision requirement.

The candidate pool is filtered by tenant and entity type before evidence comparison. Exact normalized legal/trade name, valid-at-invoice-date building relationships, exact contact values, confirmed aliases, rejected aliases, and tenant-scoped CUIT are compared explicitly. Similarity is never identity. No fuzzy score, embeddings, AI, or cross-tenant lookup exists.

The in-memory implementation is pure/testable. Prisma adds a durable decision action (`CONFIRM_EXISTING`, `REJECT_CANDIDATE`, `CREATE_NEW`, `DEFER`) to the existing append-only resolution decision model. The current alias index is a replayed projection derived from immutable decisions; it can later be persisted transactionally as a rebuildable cache.

Contacts and building relationships provide candidate support only. They do not establish identity, debt, or legal liability. Phase 3 does not mutate invoices or start Phase 4 receivables views.
