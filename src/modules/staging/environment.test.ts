import { describe, expect, it } from "vitest";
import { assertEnvironmentSeparation, parseStagingEnvironment } from "./environment";

const valid = () => ({ RECOVERIA_ENVIRONMENT: "STAGING_SYNTHETIC", RECOVERIA_DATABASE_URL: "postgresql://user:pass@staging.invalid/recoveria_pilot", RECOVERIA_GOOGLE_PROJECT_ID: "recoveria-pilot", RECOVERIA_ORGANIZATION_ID: "recoveria-synthetic-pilot", RECOVERIA_CONNECTION_ID: "google-drive-pilot", RECOVERIA_REQUIRED_SCOPE: "https://www.googleapis.com/auth/drive.readonly", RECOVERIA_CLOUD_RUN_API_AUDIENCE: "https://recoveria-staging-api.example.run.app", RECOVERIA_TASK_QUEUE: "recoveria-staging-sync", RECOVERIA_SESSION_KEY: "a".repeat(43), RECOVERIA_FOUNDER_EMAILS: "founder@example.test" });

describe("staging environment boundary", () => {
  it("accepts only the isolated synthetic staging identity", () => expect(parseStagingEnvironment(valid())).toMatchObject({ founderEmails: ["founder@example.test"] }));
  it("rejects production, Client Zero, and wrong database targets", () => {
    expect(() => parseStagingEnvironment({ ...valid(), RECOVERIA_DATABASE_URL: "postgresql://user:pass@staging.invalid/other" })).toThrow("STAGING_DATABASE_BOUNDARY_REJECTED");
    expect(() => assertEnvironmentSeparation("STAGING_SYNTHETIC", "client-zero")).toThrow("ENVIRONMENT_BOUNDARY_REJECTED");
    expect(() => parseStagingEnvironment({ ...valid(), RECOVERIA_GOOGLE_PROJECT_ID: "production" })).toThrow();
  });
});
