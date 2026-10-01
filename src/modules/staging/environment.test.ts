import { describe, expect, it } from "vitest";
import { assertEnvironmentSeparation, parseStagingEnvironment } from "./environment";

const valid = () => ({ RECOVERIA_ENVIRONMENT: "STAGING_SYNTHETIC", RECOVERIA_DATABASE_URL: "postgresql://user:pass@staging.invalid/recoveria_pilot", RECOVERIA_GOOGLE_PROJECT_ID: "recoveria-pilot", RECOVERIA_ORGANIZATION_ID: "recoveria-synthetic-pilot", RECOVERIA_CONNECTION_ID: "google-drive-pilot", RECOVERIA_REQUIRED_SCOPE: "https://www.googleapis.com/auth/drive.readonly", RECOVERIA_CLOUD_RUN_API_AUDIENCE: "https://recoveria-staging-api.example.run.app", RECOVERIA_TASK_QUEUE: "recoveria-staging-sync", RECOVERIA_SESSION_KEY: "a".repeat(43), RECOVERIA_FOUNDER_EMAILS: "founder@example.test", RECOVERIA_EXTERNAL_IDENTITY_ISSUER: "https://accounts.google.com", RECOVERIA_EXTERNAL_IDENTITY_CLIENT_ID: "synthetic-client-id", RECOVERIA_WIF_PROVIDER: "//iam.googleapis.com/projects/1/locations/global/workloadIdentityPools/p/providers/v", RECOVERIA_WIF_SERVICE_ACCOUNT: "runtime@recoveria-pilot.iam.gserviceaccount.com", RECOVERIA_VERCEL_OIDC_ISSUER: "https://oidc.vercel.com/team", RECOVERIA_VERCEL_OIDC_AUDIENCE: "https://vercel.com/team", RECOVERIA_VERCEL_OIDC_SUBJECT: "owner:team:project:recoveria:environment:production", RECOVERIA_DURABLE_SESSIONS: "prisma", RECOVERIA_FOLDER_CANDIDATES: "prisma" });

describe("staging environment boundary", () => {
  it("accepts only the isolated synthetic staging identity", () => expect(parseStagingEnvironment(valid())).toMatchObject({ founderEmails: ["founder@example.test"] }));
  it("rejects production, Client Zero, and wrong database targets", () => {
    expect(() => parseStagingEnvironment({ ...valid(), RECOVERIA_DATABASE_URL: "postgresql://user:pass@staging.invalid/other" })).toThrow("STAGING_DATABASE_BOUNDARY_REJECTED");
    expect(() => assertEnvironmentSeparation("STAGING_SYNTHETIC", "client-zero")).toThrow("ENVIRONMENT_BOUNDARY_REJECTED");
    expect(() => parseStagingEnvironment({ ...valid(), RECOVERIA_GOOGLE_PROJECT_ID: "production" })).toThrow();
  });
});
