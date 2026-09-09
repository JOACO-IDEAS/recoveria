# RecoverIA Client Zero Security

Real Client Zero data is forbidden until Phase 4.6 authorization. The designated local boundary is `.private/client-zero/` with `inbox`, `quarantine`, `temp`, and `work`; it is Git-ignored, outside `public`, fixtures, tests, and build inputs. Preflight rejects tracked/staged private or sensitive-report paths.

Logs allow only internal document ID, stage, reason code, status, and safe error class—never raw error messages or document/customer fields. Reports are aggregate-only and screenshots are always zero. Processing is tenant-scoped and local; no telemetry, network, AI, cloud, or integration is enabled.

If real data is encountered before authorization: stop, do not inspect, move/copy, log, screenshot, or parse it, and report only the boundary event without filenames/content.
