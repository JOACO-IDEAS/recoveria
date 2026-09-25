import { createServer } from "node:http";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { createCloudRunCallbackHandler, GoogleCloudKmsManagedEncryptionProvider, GoogleOAuthHttpAdapter, GoogleSecretManagerAdapter } from "../../src/modules/ingestion/google-drive-cloud-adapters";
import { callbackQuery, createGoogleDriveCloudRuntime } from "../../src/modules/ingestion/google-drive-cloud-runtime";
import { ManagedKmsEncryptionAdapter, PersistentRefreshCredentialVault, type PilotActivationConfiguration } from "../../src/modules/ingestion/google-drive-activation";
import { DurableGoogleDriveCallbackRuntime, DurableOAuthStateService } from "../../src/modules/ingestion/google-drive-durable-runtime";
import { FixedIdentityDurableCallbackAdapter } from "../../src/modules/ingestion/google-drive-real-pilot-wiring";
import { PrismaDriveConnectionLifecycleRepository, PrismaDriveCredentialEnvelopeRepository, PrismaDriveOAuthStateRepository } from "../../src/modules/ingestion/google-drive-prisma-runtime";

const required = (name: string): string => { const value = process.env[name]?.trim(); if (!value) throw new Error(`CLOUD_RUNTIME_${name}_REQUIRED`); return value; };
const databaseUrl = required("DATABASE_URL");
const expectedDatabase = required("EXPECTED_DATABASE");
const organizationId = required("ORGANIZATION_ID");
const operatorId = required("OPERATOR_ID");
const connectionId = required("CONNECTION_ID");
const callbackPath = required("CALLBACK_PATH");
const callbackUrl = required("EXACT_CALLBACK_URL");
const kmsKeyVersion = required("KMS_KEY_VERSION");
const oauthClientId = required("GOOGLE_CLIENT_ID");
const oauthSecretReference = required("GOOGLE_CLIENT_SECRET_REFERENCE");
const port = Number(process.env.PORT ?? "8080");
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("CLOUD_RUNTIME_PORT_INVALID");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, max: 2 }) });
const healthPool = new Pool({ connectionString: databaseUrl, max: 1 });
const lifecycle = new PrismaDriveConnectionLifecycleRepository(prisma);
const accessToken = async (): Promise<string> => {
  const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "Metadata-Flavor": "Google" } });
  if (!response.ok) throw new Error("GOOGLE_RUNTIME_IDENTITY_UNAVAILABLE");
  const payload = await response.json() as { access_token?: unknown };
  if (typeof payload.access_token !== "string") throw new Error("GOOGLE_RUNTIME_IDENTITY_UNAVAILABLE");
  return payload.access_token;
};
const authorizedJson = async (url: string, init: RequestInit = {}): Promise<Response> => fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" } });
const secrets = new GoogleSecretManagerAdapter({ async accessSecretVersion(resourceName) { const response = await authorizedJson(`https://secretmanager.googleapis.com/v1/${resourceName}:access`, { method: "GET" }); if (!response.ok) return null; const payload = await response.json() as { payload?: { data?: unknown } }; return typeof payload.payload?.data === "string" ? new Uint8Array(Buffer.from(payload.payload.data, "base64")) : null; } });
const kmsProvider = new GoogleCloudKmsManagedEncryptionProvider({
  async encrypt(input) { const key = input.keyResource.replace(/\/cryptoKeyVersions\/[^/]+$/, ""); const response = await authorizedJson(`https://cloudkms.googleapis.com/v1/${key}:encrypt`, { method: "POST", body: JSON.stringify({ plaintext: Buffer.from(input.plaintext).toString("base64"), additionalAuthenticatedData: Buffer.from(input.additionalAuthenticatedData).toString("base64") }) }); if (!response.ok) throw new Error("KMS_FAILED"); const payload = await response.json() as { ciphertext?: unknown }; if (typeof payload.ciphertext !== "string") throw new Error("KMS_FAILED"); return new Uint8Array(Buffer.from(payload.ciphertext, "base64")); },
  async decrypt(input) { const key = input.keyResource.replace(/\/cryptoKeyVersions\/[^/]+$/, ""); const response = await authorizedJson(`https://cloudkms.googleapis.com/v1/${key}:decrypt`, { method: "POST", body: JSON.stringify({ ciphertext: Buffer.from(input.ciphertext).toString("base64"), additionalAuthenticatedData: Buffer.from(input.additionalAuthenticatedData).toString("base64") }) }); if (!response.ok) throw new Error("KMS_FAILED"); const payload = await response.json() as { plaintext?: unknown }; if (typeof payload.plaintext !== "string") throw new Error("KMS_FAILED"); return new Uint8Array(Buffer.from(payload.plaintext, "base64")); },
}, kmsKeyVersion);
const oauth = new GoogleOAuthHttpAdapter(oauthClientId, callbackUrl, oauthSecretReference, secrets, async (url, init) => { const response = await fetch(url, init); return { status: response.status, body: response.body }; });
const callbackRuntime = new DurableGoogleDriveCallbackRuntime(
  new DurableOAuthStateService(new PrismaDriveOAuthStateRepository(prisma)),
  oauth,
  new PersistentRefreshCredentialVault(
    new ManagedKmsEncryptionAdapter({ configured: true, keyId: kmsKeyVersion.replace(/\/cryptoKeyVersions\/[^/]+$/, ""), keyVersion: kmsKeyVersion.split("/").at(-1)! }, kmsProvider),
    new PrismaDriveCredentialEnvelopeRepository(prisma),
    { keyId: kmsKeyVersion.replace(/\/cryptoKeyVersions\/[^/]+$/, ""), keyVersion: kmsKeyVersion.split("/").at(-1)! },
  ),
  lifecycle,
);
const activation: PilotActivationConfiguration = {
  activationEnabled: true,
  googleClientId: oauthClientId,
  googleClientSecretReference: oauthSecretReference,
  exactCallbackUrl: callbackUrl,
  requiredScope: "https://www.googleapis.com/auth/drive.readonly",
  organizationId,
  connectionId,
  authorizedRootId: "DRIVE_ROOT_NOT_CONFIGURED",
  limits: { expectedCorpusSize: 40, hardMaximumDownloads: 50, maximumExpansionRatio: 1.25, maximumPdfBytes: 25 * 1024 * 1024, maximumPages: 10, maximumRetryAttempts: 3, maximumExecutionDurationMs: 300_000 },
  auditPersistenceConfigured: true,
  credentialVaultConfigured: true,
  checkpointPersistenceConfigured: true,
  oauthProviderConfigured: true,
  encryptionConfigured: true,
};
const fixed = new FixedIdentityDurableCallbackAdapter(activation, { organizationId, operatorId, connectionId, callbackUrl }, callbackRuntime);
const callbackHandler = createCloudRunCallbackHandler(callbackPath, fixed);
const runtime = createGoogleDriveCloudRuntime({ callbackPath, expectedDatabase, callbackHandler, async databaseProbe() { try { const result = await healthPool.query<{ database: string }>("SELECT current_database() AS database"); return result.rows[0]?.database ?? ""; } catch (error) { const candidate = error as { readonly name?: unknown; readonly code?: unknown }; const name = typeof candidate.name === "string" && /^[A-Za-z]+$/.test(candidate.name) ? candidate.name : "DatabaseError"; const code = typeof candidate.code === "string" && /^[A-Z0-9_]+$/.test(candidate.code) ? candidate.code : "UNCLASSIFIED"; process.stderr.write(`${JSON.stringify({ event: "DATABASE_PROBE_FAILED", name, code })}\n`); throw error; } } });

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://runtime.invalid");
  const result = await runtime({ method: request.method ?? "GET", path: url.pathname, query: callbackQuery(url.searchParams), headers: Object.fromEntries(Object.entries(request.headers).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : [])) });
  response.writeHead(result.status, result.headers); response.end(result.body);
});
server.listen(port, "0.0.0.0");
const shutdown = () => { server.close(() => { void Promise.all([prisma.$disconnect(), healthPool.end()]).finally(() => process.exit(0)); }); };
process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);
