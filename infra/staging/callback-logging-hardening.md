# OAuth callback request-log hardening

Before deployment, create a dedicated log bucket and route only sanitized application audit events to it. Configure an ingress/proxy layer that rewrites the callback request target before it reaches normal Cloud Run request logging, or use a dedicated callback service whose platform request logs are excluded with a narrowly scoped filter matching only the callback request-log resource. Application logs must contain outcome, lifecycle ID hash, tenant, and timestamp only.

The Phase 7C operator must inspect the proposed filter, test with synthetic sentinel query values, prove those values are absent from `_Default` and all routed buckets, and prove sanitized lifecycle audit events remain. Do not delete historical logs or disable broad logging. Do not deploy callback authorization until this verification passes.
