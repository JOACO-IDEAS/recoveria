import { describe, expect, it } from "vitest";
import { assertEnvironmentSeparation, parseClientZeroEnvironment, parseClientZeroWorkerEnvironment, parseStagingEnvironment } from "./environment";

const valid = () => ({ RECOVERIA_ENVIRONMENT: "STAGING_SYNTHETIC", RECOVERIA_DATABASE_URL: "postgresql://user:pass@staging.invalid/recoveria_pilot", RECOVERIA_GOOGLE_PROJECT_ID: "recoveria-pilot", RECOVERIA_ORGANIZATION_ID: "recoveria-synthetic-pilot", RECOVERIA_CONNECTION_ID: "google-drive-pilot", RECOVERIA_REQUIRED_SCOPE: "https://www.googleapis.com/auth/drive.readonly", RECOVERIA_CLOUD_RUN_API_AUDIENCE: "https://recoveria-staging-api.example.run.app", RECOVERIA_TASK_QUEUE: "recoveria-staging-sync", RECOVERIA_SESSION_KEY: "a".repeat(43), RECOVERIA_FOUNDER_EMAIL: "Founder@Example.test", RECOVERIA_FOUNDER_ACTOR_ID: "founder-operator", RECOVERIA_EXTERNAL_IDENTITY_ISSUER: "https://accounts.google.com", RECOVERIA_EXTERNAL_IDENTITY_CLIENT_ID: "synthetic-client-id", RECOVERIA_WIF_PROVIDER: "//iam.googleapis.com/projects/1/locations/global/workloadIdentityPools/p/providers/v", RECOVERIA_WIF_SERVICE_ACCOUNT: "runtime@recoveria-pilot.iam.gserviceaccount.com", RECOVERIA_VERCEL_OIDC_ISSUER: "https://oidc.vercel.com/team", RECOVERIA_VERCEL_OIDC_AUDIENCE: "https://vercel.com/team", RECOVERIA_VERCEL_OIDC_SUBJECT: "owner:team:project:recoveria:environment:production", RECOVERIA_DURABLE_SESSIONS: "prisma", RECOVERIA_FOLDER_CANDIDATES: "prisma" });

const validClientZero = () => ({ RECOVERIA_ENVIRONMENT: "CLIENT_ZERO_READ_ONLY", RECOVERIA_DATABASE_URL: "postgresql://user:pass@neon.invalid/recoveria_client_zero", RECOVERIA_GOOGLE_PROJECT_ID: "recoveria-pilot", RECOVERIA_ORGANIZATION_ID: "recoveria-client-zero", RECOVERIA_CONNECTION_ID: "google-drive-client-zero", RECOVERIA_REQUIRED_SCOPE: "https://www.googleapis.com/auth/drive.readonly" });

describe("staging environment boundary", () => {
  it("accepts only the isolated synthetic staging identity", () => expect(parseStagingEnvironment(valid())).toMatchObject({ RECOVERIA_FOUNDER_EMAIL: "founder@example.test", RECOVERIA_FOUNDER_ACTOR_ID: "founder-operator" }));
  it("rejects production, Client Zero, and wrong database targets", () => {
    expect(() => parseStagingEnvironment({ ...valid(), RECOVERIA_DATABASE_URL: "postgresql://user:pass@staging.invalid/other" })).toThrow("STAGING_DATABASE_BOUNDARY_REJECTED");
    expect(() => assertEnvironmentSeparation("STAGING_SYNTHETIC", "client-zero")).toThrow("ENVIRONMENT_BOUNDARY_REJECTED");
    expect(() => parseStagingEnvironment({ ...valid(), RECOVERIA_GOOGLE_PROJECT_ID: "production" })).toThrow();
    expect(() => parseStagingEnvironment({ ...valid(), RECOVERIA_FOUNDER_ACTOR_ID: "" })).toThrow();
  });
  it("rejects a staging configuration whose database URL points at the Client Zero database", () => {
    expect(() => parseStagingEnvironment({ ...valid(), RECOVERIA_DATABASE_URL: "postgresql://user:pass@staging.invalid/recoveria_client_zero" })).toThrow("STAGING_DATABASE_BOUNDARY_REJECTED");
  });
  it("rejects a staging configuration whose organization/connection id is Client-Zero-flavored (already enforced by the exact literal schema, redundantly reinforced by assertEnvironmentSeparation)", () => {
    expect(() => parseStagingEnvironment({ ...valid(), RECOVERIA_ORGANIZATION_ID: "recoveria-client-zero" })).toThrow();
    expect(() => parseStagingEnvironment({ ...valid(), RECOVERIA_CONNECTION_ID: "christophersen-drive" })).toThrow();
  });
});

describe("Client Zero environment boundary (Phase 8A)", () => {
  it("accepts only the isolated Client Zero identity", () => expect(parseClientZeroEnvironment(validClientZero())).toMatchObject({ RECOVERIA_ENVIRONMENT: "CLIENT_ZERO_READ_ONLY", RECOVERIA_ORGANIZATION_ID: "recoveria-client-zero" }));
  it("the worker-scoped parser accepts the same minimal composition", () => expect(parseClientZeroWorkerEnvironment(validClientZero())).toMatchObject({ RECOVERIA_ENVIRONMENT: "CLIENT_ZERO_READ_ONLY" }));
  it("rejects the staging database (recoveria_pilot) under the Client Zero environment", () => {
    expect(() => parseClientZeroEnvironment({ ...validClientZero(), RECOVERIA_DATABASE_URL: "postgresql://user:pass@neon.invalid/recoveria_pilot" })).toThrow("CLIENT_ZERO_DATABASE_BOUNDARY_REJECTED");
  });
  it("rejects a ConcilIA-looking database under the Client Zero environment", () => {
    expect(() => parseClientZeroEnvironment({ ...validClientZero(), RECOVERIA_DATABASE_URL: "postgresql://user:pass@concilia.invalid/recoveria_client_zero" })).toThrow("CLIENT_ZERO_DATABASE_BOUNDARY_REJECTED");
  });
  it("rejects the synthetic staging tenant/connection identity under the Client Zero environment", () => {
    expect(() => parseClientZeroEnvironment({ ...validClientZero(), RECOVERIA_ORGANIZATION_ID: "recoveria-synthetic-pilot" })).toThrow("CLIENT_ZERO_STAGING_MIX_REJECTED");
    expect(() => parseClientZeroEnvironment({ ...validClientZero(), RECOVERIA_CONNECTION_ID: "google-drive-pilot" })).toThrow("CLIENT_ZERO_STAGING_MIX_REJECTED");
  });
  it("rejects collections/outbound-communication capability flags, even if present and falsy-looking", () => {
    expect(() => parseClientZeroEnvironment({ ...validClientZero(), RECOVERIA_COLLECTIONS_ENABLED: "false" })).toThrow();
    expect(() => parseClientZeroEnvironment({ ...validClientZero(), RECOVERIA_OUTBOUND_COMMUNICATION_ENABLED: "false" })).toThrow();
  });
  it("cross-environment rejection is symmetric: a Client Zero identifier is never accepted anywhere except CLIENT_ZERO_READ_ONLY, and vice versa", () => {
    expect(() => assertEnvironmentSeparation("LOCAL", "recoveria-client-zero")).toThrow("ENVIRONMENT_BOUNDARY_REJECTED");
    expect(() => assertEnvironmentSeparation("STAGING_SYNTHETIC", "christophersen-ascensores")).toThrow("ENVIRONMENT_BOUNDARY_REJECTED");
    expect(() => assertEnvironmentSeparation("CLIENT_ZERO_READ_ONLY", "recoveria-synthetic-pilot")).toThrow("CLIENT_ZERO_STAGING_MIX_REJECTED");
    expect(() => assertEnvironmentSeparation("CLIENT_ZERO_READ_ONLY", "google-drive-pilot")).toThrow("CLIENT_ZERO_STAGING_MIX_REJECTED");
    expect(() => assertEnvironmentSeparation("CLIENT_ZERO_READ_ONLY", "recoveria-client-zero")).not.toThrow();
  });
});
