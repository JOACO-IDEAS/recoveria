import { z } from "zod";

// CLIENT_ZERO_READ_ONLY replaces an earlier, never-wired PRODUCTION_CLIENT_ZERO
// placeholder (Phase 8A): Phase 8 is explicitly read-only with no collection
// actions, so a name containing "PRODUCTION" would misleadingly suggest a
// broader authority than this environment ever grants.
export const RecoveriaEnvironment = z.enum(["LOCAL", "STAGING_SYNTHETIC", "CLIENT_ZERO_READ_ONLY"]);
export type RecoveriaEnvironment = z.infer<typeof RecoveriaEnvironment>;

const stagingSchema = z.object({
  RECOVERIA_ENVIRONMENT: z.literal("STAGING_SYNTHETIC"),
  RECOVERIA_DATABASE_URL: z.string().url(),
  RECOVERIA_GOOGLE_PROJECT_ID: z.literal("recoveria-pilot"),
  RECOVERIA_ORGANIZATION_ID: z.literal("recoveria-synthetic-pilot"),
  RECOVERIA_CONNECTION_ID: z.literal("google-drive-pilot"),
  RECOVERIA_REQUIRED_SCOPE: z.literal("https://www.googleapis.com/auth/drive.readonly"),
  RECOVERIA_CLOUD_RUN_API_AUDIENCE: z.string().url().startsWith("https://"),
  RECOVERIA_TASK_QUEUE: z.string().min(1),
  RECOVERIA_SESSION_KEY: z.string().min(43),
  RECOVERIA_FOUNDER_EMAIL: z.string().email(),
  RECOVERIA_FOUNDER_ACTOR_ID: z.string().min(1),
  RECOVERIA_EXTERNAL_IDENTITY_ISSUER: z.literal("https://accounts.google.com"),
  RECOVERIA_EXTERNAL_IDENTITY_CLIENT_ID: z.string().min(10),
  RECOVERIA_WIF_PROVIDER: z.string().startsWith("//iam.googleapis.com/projects/"),
  RECOVERIA_WIF_SERVICE_ACCOUNT: z.string().email(),
  RECOVERIA_VERCEL_OIDC_ISSUER: z.string().url().startsWith("https://oidc.vercel.com/"),
  RECOVERIA_VERCEL_OIDC_AUDIENCE: z.string().url().startsWith("https://vercel.com/"),
  RECOVERIA_VERCEL_OIDC_SUBJECT: z.string().min(20),
  RECOVERIA_DURABLE_SESSIONS: z.literal("prisma"),
  RECOVERIA_FOLDER_CANDIDATES: z.literal("prisma"),
});

export type StagingEnvironment = z.infer<typeof stagingSchema>;

const stagingWorkerSchema = stagingSchema.pick({
  RECOVERIA_ENVIRONMENT: true,
  RECOVERIA_DATABASE_URL: true,
  RECOVERIA_GOOGLE_PROJECT_ID: true,
  RECOVERIA_ORGANIZATION_ID: true,
  RECOVERIA_CONNECTION_ID: true,
  RECOVERIA_REQUIRED_SCOPE: true,
});

export type StagingWorkerEnvironment = z.infer<typeof stagingWorkerSchema>;

function assertStagingDatabaseBoundary(databaseUrl: string): void {
  const database = new URL(databaseUrl);
  const serialized = `${database.hostname}${database.pathname}`.toLowerCase();
  if (database.pathname !== "/recoveria_pilot" || /client[-_]?zero|concilia|production/.test(serialized)) throw new Error("STAGING_DATABASE_BOUNDARY_REJECTED");
}

export function parseStagingEnvironment(input: Record<string, string | undefined>): StagingEnvironment {
  const parsed = stagingSchema.parse(input);
  assertStagingDatabaseBoundary(parsed.RECOVERIA_DATABASE_URL);
  assertEnvironmentSeparation("STAGING_SYNTHETIC", parsed.RECOVERIA_ORGANIZATION_ID);
  assertEnvironmentSeparation("STAGING_SYNTHETIC", parsed.RECOVERIA_CONNECTION_ID);
  return { ...parsed, RECOVERIA_FOUNDER_EMAIL: parsed.RECOVERIA_FOUNDER_EMAIL.toLowerCase() };
}

export function parseStagingWorkerEnvironment(input: Record<string, string | undefined>): StagingWorkerEnvironment {
  const parsed = stagingWorkerSchema.parse(input);
  assertStagingDatabaseBoundary(parsed.RECOVERIA_DATABASE_URL);
  assertEnvironmentSeparation("STAGING_SYNTHETIC", parsed.RECOVERIA_ORGANIZATION_ID);
  assertEnvironmentSeparation("STAGING_SYNTHETIC", parsed.RECOVERIA_CONNECTION_ID);
  return parsed;
}

// Phase 8A: a first-class, separately-isolated environment for the no-collections,
// read-only, real-document corpus. Mirrors stagingSchema's shape so the same
// composition-check pattern (see runtime-config.ts) applies symmetrically.
const clientZeroSchema = z.object({
  RECOVERIA_ENVIRONMENT: z.literal("CLIENT_ZERO_READ_ONLY"),
  RECOVERIA_DATABASE_URL: z.string().url(),
  RECOVERIA_GOOGLE_PROJECT_ID: z.literal("recoveria-pilot"),
  RECOVERIA_ORGANIZATION_ID: z.string().min(1),
  RECOVERIA_CONNECTION_ID: z.string().min(1),
  RECOVERIA_REQUIRED_SCOPE: z.literal("https://www.googleapis.com/auth/drive.readonly"),
});
export type ClientZeroEnvironment = z.infer<typeof clientZeroSchema>;

const clientZeroWorkerSchema = clientZeroSchema.pick({
  RECOVERIA_ENVIRONMENT: true,
  RECOVERIA_DATABASE_URL: true,
  RECOVERIA_GOOGLE_PROJECT_ID: true,
  RECOVERIA_ORGANIZATION_ID: true,
  RECOVERIA_CONNECTION_ID: true,
  RECOVERIA_REQUIRED_SCOPE: true,
});
export type ClientZeroWorkerEnvironment = z.infer<typeof clientZeroWorkerSchema>;

// Fails closed on exactly what the known staging identity looks like -- never
// an open-ended "not recoveria_pilot" check, which would also wrongly accept
// recoveria_test/recoveria_smoke/a ConcilIA database or an unrelated typo.
function assertClientZeroDatabaseBoundary(databaseUrl: string): void {
  const database = new URL(databaseUrl);
  const serialized = `${database.hostname}${database.pathname}`.toLowerCase();
  if (database.pathname !== "/recoveria_client_zero" || /recoveria_pilot|recoveria_test|recoveria_smoke|concilia/.test(serialized)) throw new Error("CLIENT_ZERO_DATABASE_BOUNDARY_REJECTED");
}

// Checked outside the zod schema (not z.undefined()): these are capability
// flags that must never be "on" in this environment, regardless of value --
// present-but-false is still a signal that something is trying to configure
// a capability here that structurally cannot exist in CLIENT_ZERO_READ_ONLY.
function assertNoClientZeroCapabilityFlags(input: Record<string, string | undefined>): void {
  if (input.RECOVERIA_COLLECTIONS_ENABLED !== undefined) throw new Error("CLIENT_ZERO_COLLECTIONS_CAPABILITY_REJECTED");
  if (input.RECOVERIA_OUTBOUND_COMMUNICATION_ENABLED !== undefined) throw new Error("CLIENT_ZERO_OUTBOUND_CAPABILITY_REJECTED");
}

export function parseClientZeroEnvironment(input: Record<string, string | undefined>): ClientZeroEnvironment {
  const parsed = clientZeroSchema.parse(input);
  assertClientZeroDatabaseBoundary(parsed.RECOVERIA_DATABASE_URL);
  assertEnvironmentSeparation("CLIENT_ZERO_READ_ONLY", parsed.RECOVERIA_ORGANIZATION_ID);
  assertEnvironmentSeparation("CLIENT_ZERO_READ_ONLY", parsed.RECOVERIA_CONNECTION_ID);
  assertNoClientZeroCapabilityFlags(input);
  return parsed;
}

export function parseClientZeroWorkerEnvironment(input: Record<string, string | undefined>): ClientZeroWorkerEnvironment {
  const parsed = clientZeroWorkerSchema.parse(input);
  assertClientZeroDatabaseBoundary(parsed.RECOVERIA_DATABASE_URL);
  assertEnvironmentSeparation("CLIENT_ZERO_READ_ONLY", parsed.RECOVERIA_ORGANIZATION_ID);
  assertEnvironmentSeparation("CLIENT_ZERO_READ_ONLY", parsed.RECOVERIA_CONNECTION_ID);
  assertNoClientZeroCapabilityFlags(input);
  return parsed;
}

// Bidirectional: a Client-Zero-flavored identifier (organization/connection
// id, etc.) must never be accepted by LOCAL/STAGING_SYNTHETIC, and a
// staging/synthetic-flavored identifier must never be accepted by
// CLIENT_ZERO_READ_ONLY. Neither direction is a "soft" warning -- both throw.
export function assertEnvironmentSeparation(environment: RecoveriaEnvironment, value: string): void {
  const normalized = value.toLowerCase();
  if (environment !== "CLIENT_ZERO_READ_ONLY" && /client[-_]?zero|christophersen|concilia|catedral/.test(normalized)) throw new Error("ENVIRONMENT_BOUNDARY_REJECTED");
  if (environment === "STAGING_SYNTHETIC" && /production/.test(normalized)) throw new Error("STAGING_PRODUCTION_MIX_REJECTED");
  if (environment === "CLIENT_ZERO_READ_ONLY" && /synthetic-pilot|staging|recoveria-synthetic|google-drive-pilot/.test(normalized)) throw new Error("CLIENT_ZERO_STAGING_MIX_REJECTED");
}
