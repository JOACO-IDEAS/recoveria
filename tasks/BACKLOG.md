# Backlog

Keep this file short and current — prune/move items as they're done or superseded rather than letting it grow unbounded. See [knowledge/ROADMAP.md](../knowledge/ROADMAP.md) for the phase-level sequence this backlog feeds into.

## NOW

- Founder completes the 20-invoice labels in the upgraded private local review tool (`npm run client-zero:review-server`). Start with `DISAGREEMENTS`, `AMBIGUOUS`, and `NEEDS HUMAN REVIEW`; only founder ground truth may turn machine agreement into measured accuracy. Two existing founder labels are preserved; 238 remain unreviewed.
- Decide whether to additively persist a `DriveSourceCheckpoint` row for the canary results, so the existing Product Surface read model can render them privately (see `CURRENT_STATE.md`'s Phase 8B.1 Product Surface finding) — smallest next engineering step, not yet authorized.

## NEXT

- Scale beyond the 20-invoice canary to the first representative real-invoice sample (~200-500 invoices, readiness doc point 4) — a separate authorization from 8B.1's, do not treat it as already covered. Requires: named data-owner authorization, security gate sign-off, real OAuth/Drive connection setup, and dedicated Client Zero compute/task-queue identities at that point.
- Phase 8C: build the human-reviewed ground-truth sample and the objective quality metrics harness at scale (readiness doc points 5-6) once the 200-500 sample is authorized.

## LATER

- Phase 9: Catedral direct-connection design (prefer direct integration over Drive-as-transport, see [knowledge/DATA_SOURCES.md](../knowledge/DATA_SOURCES.md)).
- Phase 10-14 per [knowledge/ROADMAP.md](../knowledge/ROADMAP.md) — portfolio/receivable state, contacts/case intelligence, collections dry run, limited approved actions, progressive automation. Each is its own future authorization gate; nothing here is pre-approved.

## P2 / non-blocking

Phase 7C manual QA — human-verified, not engineering blockers, do not let these block Client Zero work:

- Authenticated visual QA (Inicio, Fuentes, Facturas, invoice detail, Evidence Inspector, responsive widths 1440/1280/1024/768/430/390/375) — pending because the Codex integrated browser cannot complete Google Identity Services; needs the founder's normal browser.
- Manual UI confirmation that Fuentes shows `CONNECTED` / 40 documents / 39 unique / 1 duplicate (backend truth already confirmed via direct DB read).
- Logout/revocation and navigation-persistence checks in an authenticated normal-browser session.
- Additional adversarial-auth hardening evidence (CSRF/session/tenant edge cases beyond what every probe this session already exercised) — optional, no known defect.

Move an item out of P2 immediately if it turns out to reveal an actual functional or security defect — it is only non-blocking while it stays cosmetic/procedural.
