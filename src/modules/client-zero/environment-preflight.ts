// Phase 8A: environment/runtime-identity preflight for CLIENT_ZERO_READ_ONLY.
// Distinct from preflight.ts, which only checks the local .private/client-zero
// git boundary. This checks that a *runtime configuration* (env vars) is
// actually, unambiguously scoped to the isolated Client Zero environment --
// never a staging/synthetic identifier, never a ConcilIA reference, never a
// collections/outbound/legal-automation capability turned on.

const STAGING_MARKERS = ["recoveria-synthetic-pilot", "google-drive-pilot", "recoveria_pilot", "staging"];
const FORBIDDEN_SUBSTRINGS = ["concilia", "catedral"];

export interface ClientZeroEnvironmentPreflightResult {
  ok: boolean;
  checks: {
    environmentIsClientZeroReadOnly: boolean;
    projectIdentityExpected: boolean;
    databaseIdentityExpected: boolean;
    tenantIdentityExpected: boolean;
    oauthBoundaryClear: boolean;
    driveSourceBoundaryClear: boolean;
    collectionsDisabled: boolean;
    outboundCommunicationDisabled: boolean;
    legalAutomationDisabled: boolean;
    syntheticFixtureFallbackDisabled: boolean;
    concilaAndCatedralResourcesRejected: boolean;
  };
  reasons: string[];
}

function hasForbiddenMarker(value: string | undefined, markers: readonly string[]): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return markers.some(marker => normalized.includes(marker));
}

export function clientZeroEnvironmentPreflight(source: Record<string, string | undefined>): ClientZeroEnvironmentPreflightResult {
  const reasons: string[] = [];
  const fail = (reason: string) => { reasons.push(reason); return false; };

  const environmentIsClientZeroReadOnly = source.RECOVERIA_ENVIRONMENT === "CLIENT_ZERO_READ_ONLY" || fail("RECOVERIA_ENVIRONMENT is not CLIENT_ZERO_READ_ONLY");
  const projectIdentityExpected = source.RECOVERIA_GOOGLE_PROJECT_ID === "recoveria-pilot" || fail("RECOVERIA_GOOGLE_PROJECT_ID is not the expected recoveria-pilot project");

  let databaseIdentityExpected = false;
  const databaseUrl = source.RECOVERIA_DATABASE_URL;
  if (!databaseUrl) {
    fail("RECOVERIA_DATABASE_URL is missing");
  } else {
    try {
      const parsed = new URL(databaseUrl);
      const serialized = `${parsed.hostname}${parsed.pathname}`.toLowerCase();
      if (parsed.pathname !== "/recoveria_client_zero") fail(`database path is not /recoveria_client_zero (got ${parsed.pathname})`);
      else if (/recoveria_pilot|recoveria_test|recoveria_smoke|concilia/.test(serialized)) fail("database URL contains a forbidden staging/ConcilIA marker");
      else databaseIdentityExpected = true;
    } catch { fail("RECOVERIA_DATABASE_URL is not a valid URL"); }
  }

  const organizationId = source.RECOVERIA_ORGANIZATION_ID;
  const tenantIdentityExpected = (() => {
    if (!organizationId) return fail("RECOVERIA_ORGANIZATION_ID is missing");
    if (hasForbiddenMarker(organizationId, STAGING_MARKERS)) return fail("RECOVERIA_ORGANIZATION_ID reuses a staging/synthetic tenant identifier");
    if (hasForbiddenMarker(organizationId, FORBIDDEN_SUBSTRINGS)) return fail("RECOVERIA_ORGANIZATION_ID contains a ConcilIA/Catedral marker");
    return true;
  })();

  const connectedSourceKeys = Object.keys(source).filter(key => key.startsWith("CONNECTED_SOURCE_"));
  const oauthBoundaryClear = (() => {
    const offending = connectedSourceKeys.filter(key => hasForbiddenMarker(source[key], STAGING_MARKERS));
    if (offending.length > 0) return fail(`Connected Source configuration reuses staging identifiers: ${offending.join(", ")}`);
    return true;
  })();

  const driveSourceBoundaryClear = (() => {
    const rootId = source.RECOVERIA_CLIENT_ZERO_DRIVE_ROOT_ID ?? source.CONNECTED_SOURCE_APPROVED_ROOT_ID;
    if (rootId && hasForbiddenMarker(rootId, STAGING_MARKERS)) return fail("Drive root identifier reuses a staging/synthetic value");
    return true;
  })();

  const collectionsDisabled = source.RECOVERIA_COLLECTIONS_ENABLED === undefined || fail("RECOVERIA_COLLECTIONS_ENABLED must be unset in CLIENT_ZERO_READ_ONLY");
  const outboundCommunicationDisabled = source.RECOVERIA_OUTBOUND_COMMUNICATION_ENABLED === undefined || fail("RECOVERIA_OUTBOUND_COMMUNICATION_ENABLED must be unset in CLIENT_ZERO_READ_ONLY");
  const legalAutomationDisabled = source.RECOVERIA_LEGAL_AUTOMATION_ENABLED === undefined || fail("RECOVERIA_LEGAL_AUTOMATION_ENABLED must be unset in CLIENT_ZERO_READ_ONLY");
  const syntheticFixtureFallbackDisabled = source.RECOVERIA_PRODUCT_SURFACE_DOCUMENT_DIRECTORY === undefined || fail("RECOVERIA_PRODUCT_SURFACE_DOCUMENT_DIRECTORY (local fixture override) must be unset in CLIENT_ZERO_READ_ONLY");

  const concilaAndCatedralResourcesRejected = (() => {
    const offending = Object.entries(source).filter(([, value]) => hasForbiddenMarker(value, FORBIDDEN_SUBSTRINGS));
    if (offending.length > 0) return fail(`Configuration references ConcilIA/Catedral: ${offending.map(([key]) => key).join(", ")}`);
    return true;
  })();

  const checks = {
    environmentIsClientZeroReadOnly,
    projectIdentityExpected,
    databaseIdentityExpected,
    tenantIdentityExpected,
    oauthBoundaryClear,
    driveSourceBoundaryClear,
    collectionsDisabled,
    outboundCommunicationDisabled,
    legalAutomationDisabled,
    syntheticFixtureFallbackDisabled,
    concilaAndCatedralResourcesRejected,
  };
  const ok = Object.values(checks).every(Boolean);
  return { ok, checks, reasons };
}
