# Phase 7B rollback manifest

- Preserved public Vercel project: `recoveria-gestion`
- Preserved alias: `https://recoveria-gestion.vercel.app`
- Immutable deployment: `dpl_N8eSdc8j8nnQGaLT4XywxgF8jf8u`
- Immutable deployment URL: `https://recoveria-gestion-k4axkba47-joaco-projects-projects.vercel.app`
- Core starting HEAD: `54d6d428ca74670ea3903e1ee6ad07597a1d388a`
- Visual backup: `.private/backups/recoveria-product-surface-20260930T214500-0300.tar.gz`
- Visual backup SHA-256: `c34a6f98f9e0dc85ef5debdf9c2cf156faf3ee4fc3dab7cdc586102a00737d7e`
- Database migration state: existing migrations through `20260930233000_connected_source_sync_intent`; Phase 7B migration created but not applied.
- Existing Cloud Run callback/runtime image: `runtime:c0f853b-c4b1`; current service remains unchanged.

Rollback means retaining the alias on the immutable deployment above. Phase 7B performs no deployment, promotion, DNS change, migration application, or external resource mutation.
