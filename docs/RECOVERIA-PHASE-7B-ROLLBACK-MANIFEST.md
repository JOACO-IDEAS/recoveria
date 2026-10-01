# Phase 7B rollback manifest

- Preserved public Vercel project: `recoveria-gestion`
- Preserved alias: `https://recoveria-gestion.vercel.app`
- Immutable deployment: `dpl_N8eSdc8j8nnQGaLT4XywxgF8jf8u`
- Immutable deployment URL: `https://recoveria-gestion-k4axkba47-joaco-projects-projects.vercel.app`
- Core starting HEAD: `54d6d428ca74670ea3903e1ee6ad07597a1d388a`
- Visual backup: `.private/backups/recoveria-product-surface-20260930T214500-0300.tar.gz`
- Visual backup SHA-256: `c34a6f98f9e0dc85ef5debdf9c2cf156faf3ee4fc3dab7cdc586102a00737d7e`
- Database migration state: additive migration `20260930234500_staging_foundation` applied to the isolated `recoveria_pilot` database during the Phase 7C preflight. Checkpoint v5, 40 committed synthetic documents, 40/40 provider identities, OAuth lifecycle, and historical execution/intent counts were preserved. The migration contains no destructive data operation and is forward-fix compatible.
- Existing Cloud Run callback/runtime image: `runtime:c0f853b-c4b1`; current service remains unchanged.

Rollback means retaining the alias on the immutable deployment above. Phase 7B performed no deployment, promotion, DNS change, migration application, or external resource mutation. Phase 7C stopped before deployment after its additive staging migration because the founder-auth and Vercel-to-Cloud-Run identity compositions were not yet executable without security weakening.
