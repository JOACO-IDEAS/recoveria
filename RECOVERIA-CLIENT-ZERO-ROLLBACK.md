# RecoverIA Client Zero Rollback

Before import, stop writers, create a local database snapshot/transactional backup plus application-state identifier, verify restore, and record approved document checksums using safe internal IDs. Run the import in an isolated local dataset/tenant.

To discard: stop workers, restore the pre-import snapshot, verify Client Zero rows/import IDs are absent, clear only temporary/quarantine artifacts authorized for removal, retain originals unless the owner requests deletion, run Git preflight, and exit real-data mode. To retain: preserve authorized originals/structured state under the retention policy, still clear temporary artifacts, and record sanitized counts.

No database currently exists, so Phase 4.5 creates no snapshot. The future operator must choose and test the concrete PostgreSQL local backup/restore commands before ingestion.
