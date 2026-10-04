import { describe, expect, it } from "vitest";
import { clientZeroEnvironmentPreflight } from "./environment-preflight";

const valid = (): Record<string, string | undefined> => ({
  RECOVERIA_ENVIRONMENT: "CLIENT_ZERO_READ_ONLY",
  RECOVERIA_GOOGLE_PROJECT_ID: "recoveria-pilot",
  RECOVERIA_DATABASE_URL: "postgresql://u:p@ep-crimson-union-au0v5aus.c-10.us-east-1.aws.neon.tech/recoveria_client_zero",
  RECOVERIA_ORGANIZATION_ID: "recoveria-client-zero",
});

describe("Client Zero environment preflight", () => {
  it("passes on a correctly isolated configuration", () => {
    const result = clientZeroEnvironmentPreflight(valid());
    expect(result).toEqual(expect.objectContaining({ ok: true, reasons: [] }));
    expect(Object.values(result.checks).every(Boolean)).toBe(true);
  });

  it("fails closed on the wrong environment value", () => {
    const result = clientZeroEnvironmentPreflight({ ...valid(), RECOVERIA_ENVIRONMENT: "STAGING_SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.checks.environmentIsClientZeroReadOnly).toBe(false);
  });

  it("fails closed on the staging database (recoveria_pilot)", () => {
    const result = clientZeroEnvironmentPreflight({ ...valid(), RECOVERIA_DATABASE_URL: "postgresql://u:p@ep-crimson-union-au0v5aus.c-10.us-east-1.aws.neon.tech/recoveria_pilot" });
    expect(result.ok).toBe(false);
    expect(result.checks.databaseIdentityExpected).toBe(false);
  });

  it("fails closed on recoveria_test and recoveria_smoke databases", () => {
    for (const db of ["recoveria_test", "recoveria_smoke"]) {
      const result = clientZeroEnvironmentPreflight({ ...valid(), RECOVERIA_DATABASE_URL: `postgresql://u:p@host.invalid/${db}` });
      expect(result.ok).toBe(false);
      expect(result.checks.databaseIdentityExpected).toBe(false);
    }
  });

  it("fails closed on a ConcilIA-looking database host", () => {
    const result = clientZeroEnvironmentPreflight({ ...valid(), RECOVERIA_DATABASE_URL: "postgresql://u:p@concilia-host.invalid/recoveria_client_zero" });
    expect(result.ok).toBe(false);
    expect(result.checks.databaseIdentityExpected).toBe(false);
  });

  it("fails closed when the synthetic tenant identity is reused", () => {
    const result = clientZeroEnvironmentPreflight({ ...valid(), RECOVERIA_ORGANIZATION_ID: "recoveria-synthetic-pilot" });
    expect(result.ok).toBe(false);
    expect(result.checks.tenantIdentityExpected).toBe(false);
  });

  it("fails closed when Connected Source configuration reuses staging identifiers", () => {
    const result = clientZeroEnvironmentPreflight({ ...valid(), CONNECTED_SOURCE_ORGANIZATION_ID: "recoveria-synthetic-pilot", CONNECTED_SOURCE_CONNECTION_ID: "google-drive-pilot" });
    expect(result.ok).toBe(false);
    expect(result.checks.oauthBoundaryClear).toBe(false);
  });

  it("fails closed when a Drive root identifier reuses the staging root", () => {
    const result = clientZeroEnvironmentPreflight({ ...valid(), RECOVERIA_CLIENT_ZERO_DRIVE_ROOT_ID: "google-drive-pilot-root" });
    expect(result.ok).toBe(false);
    expect(result.checks.driveSourceBoundaryClear).toBe(false);
  });

  it("fails closed if collections, outbound communication, or legal automation are enabled", () => {
    expect(clientZeroEnvironmentPreflight({ ...valid(), RECOVERIA_COLLECTIONS_ENABLED: "true" }).checks.collectionsDisabled).toBe(false);
    expect(clientZeroEnvironmentPreflight({ ...valid(), RECOVERIA_OUTBOUND_COMMUNICATION_ENABLED: "true" }).checks.outboundCommunicationDisabled).toBe(false);
    expect(clientZeroEnvironmentPreflight({ ...valid(), RECOVERIA_LEGAL_AUTOMATION_ENABLED: "true" }).checks.legalAutomationDisabled).toBe(false);
  });

  it("fails closed if a local synthetic fixture fallback directory is configured", () => {
    const result = clientZeroEnvironmentPreflight({ ...valid(), RECOVERIA_PRODUCT_SURFACE_DOCUMENT_DIRECTORY: "/tmp/fixtures" });
    expect(result.ok).toBe(false);
    expect(result.checks.syntheticFixtureFallbackDisabled).toBe(false);
  });

  it("fails closed if any configuration value references ConcilIA or Catedral", () => {
    const result = clientZeroEnvironmentPreflight({ ...valid(), RECOVERIA_SOME_FUTURE_FLAG: "catedral-export-path" });
    expect(result.ok).toBe(false);
    expect(result.checks.concilaAndCatedralResourcesRejected).toBe(false);
  });

  it("reports every independent failure, not just the first", () => {
    const result = clientZeroEnvironmentPreflight({ RECOVERIA_ENVIRONMENT: "LOCAL" });
    expect(result.ok).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(1);
  });
});
