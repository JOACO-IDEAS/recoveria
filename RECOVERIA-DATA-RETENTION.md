# RecoverIA Data Retention

- Originals: retain locally in the private boundary until the data owner authorizes deletion; never auto-delete.
- Temporary parser artifacts: minimum necessary, mode 0600 under private temp, always delete in `finally`; manual cleanup removes only `.private/client-zero/temp/run-*` after confirming no process is active.
- Structured extracted candidates: retain only inside the rollback-scoped local experiment; uncertain values remain evidence, not truth.
- Human-confirmed data/history: retain with authorization and audit requirements; rollback policy must explicitly decide whether decisions are discarded.
- Sanitized metrics: may be retained if strictly aggregate and reviewed for re-identification risk.

No cloud backup is created. Retention durations and lawful basis require data-owner approval before Phase 4.6.
