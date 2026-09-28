# RecoverIA Phase 6A.2 — Live Product Surface integration

## Result

Facturas V2 reads the single committed C5B synthetic checkpoint through the Phase 6A.1 contract. The browser never receives database credentials, an API bearer token, source/root IDs, OAuth material or raw checkpoint JSON.

The integration exposes four read-only core routes: invoice list, invoice detail, field evidence and document relationships. Each route requires a server-only bearer token and derives its organization/source/connection scope exclusively from server environment. The Prisma adapter performs one exact compound-key lookup and the query service revalidates the checkpoint and every entry before mapping.

The visual surface uses a same-origin server proxy. It is intentionally enabled only in development on a loopback host. The public showroom has no access token and therefore cannot enumerate the checkpoint. Production activation requires a separately approved authenticated server deployment; no client-visible shared token is acceptable.

## Product behavior

- The list contains the 40 committed synthetic C5B records and never mixes legacy showroom invoices.
- Primary columns are invoice/document number, candidate entity, issue date, documented nominal total, review and confidence.
- Search, review-required and confidence filters are exposed in the first visual pass. The core endpoint also safely supports the remaining Phase 6A.1 documentary filters.
- Invoice detail shows documentary values only. It never maps nominal total to debt or balance.
- Evidence Inspector retrieves persisted excerpt, page and region for the selected field.
- FACT values are calm/default; INFERENCE is presented as a proposal; UNKNOWN is presented as not identified/review-required.
- Exact and possible business duplicates remain separate statuses. Documents are never merged.
- Cross-document relationships are fetched only after explicit progressive disclosure for the selected document.
- Full PDF viewing stays unavailable and is truthfully labeled as future work.
- Loading, empty, API-unavailable and unauthorized states fail closed; no hardcoded invoice fallback is used.

## Local trust boundary and run instructions

Prerequisites: the ignored synthetic-pilot database reference must already exist, the C5B checkpoint must be present, dependencies must be installed, and the core production build must be current.

From the core repository:

```bash
npm run build
npm run product-surface:local
```

Open `http://127.0.0.1:3101/`, then choose **Facturas**. The runner:

1. reads the ignored synthetic-pilot database reference without printing it;
2. selects the sole Google Drive checkpoint boundary with a read-only query;
3. creates a random in-memory bearer token;
4. starts the core production server on port 3100;
5. starts the visual development server on port 3101 with the token only in its server environment;
6. destroys the token when the process exits.

The runner does not call Drive, refresh OAuth, run ingestion or mutate the database. Stop both servers with `Ctrl+C`.

## Deployment path after founder approval

Do not reuse the local loopback gate as production authentication. Before deployment:

1. place the core read API behind the approved authenticated application/session boundary;
2. bind organization/source/connection server-side for the synthetic showroom;
3. store database and proxy credentials only in the deployment secret store;
4. deploy the dynamic visual server (static export is intentionally removed because it cannot protect credentials);
5. validate unauthorized denial, source scoping and no-cache headers in staging;
6. perform founder visual review and separately authorize deployment;
7. keep PDF retrieval deferred until its own bounded security review.

## Deferred items

- Full PDF retrieval/rendering.
- Production identity/session selection.
- P2-1 retry-capable transport composition guard.
- P2-2 checkpoint-commit versus terminal-execution timing window.

The P2 items remain required before the next real Drive execution and were not changed by 6A.2.
