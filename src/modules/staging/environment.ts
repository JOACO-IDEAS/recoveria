import { z } from "zod";

export const RecoveriaEnvironment = z.enum(["LOCAL", "STAGING_SYNTHETIC", "PRODUCTION_CLIENT_ZERO"]);
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
  RECOVERIA_FOUNDER_EMAILS: z.string().min(3),
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

export type StagingEnvironment = z.infer<typeof stagingSchema> & { readonly founderEmails: readonly string[] };

export function parseStagingEnvironment(input: Record<string, string | undefined>): StagingEnvironment {
  const parsed = stagingSchema.parse(input);
  const database = new URL(parsed.RECOVERIA_DATABASE_URL);
  const serialized = `${database.hostname}${database.pathname}`.toLowerCase();
  if (database.pathname !== "/recoveria_pilot" || /client[-_]?zero|concilia|production/.test(serialized)) throw new Error("STAGING_DATABASE_BOUNDARY_REJECTED");
  const founderEmails = [...new Set(parsed.RECOVERIA_FOUNDER_EMAILS.split(",").map(value => value.trim().toLowerCase()).filter(Boolean))];
  if (!founderEmails.length || founderEmails.some(value => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value))) throw new Error("STAGING_FOUNDER_ALLOWLIST_INVALID");
  return { ...parsed, founderEmails };
}

export function assertEnvironmentSeparation(environment: RecoveriaEnvironment, value: string): void {
  const normalized = value.toLowerCase();
  if (environment !== "PRODUCTION_CLIENT_ZERO" && /client[-_]?zero|christophersen|concilia|catedral/.test(normalized)) throw new Error("ENVIRONMENT_BOUNDARY_REJECTED");
  if (environment === "STAGING_SYNTHETIC" && /production/.test(normalized)) throw new Error("STAGING_PRODUCTION_MIX_REJECTED");
}
