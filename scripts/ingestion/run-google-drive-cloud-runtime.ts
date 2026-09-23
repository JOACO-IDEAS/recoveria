import { createServer } from "node:http";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { createCloudRunCallbackHandler } from "../../src/modules/ingestion/google-drive-cloud-adapters";
import { callbackQuery, createGoogleDriveCloudRuntime } from "../../src/modules/ingestion/google-drive-cloud-runtime";
import { PersistentRefreshCredentialVault, UnconfiguredGoogleOAuthClient, type PilotActivationConfiguration } from "../../src/modules/ingestion/google-drive-activation";
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
const callbackRuntime = new DurableGoogleDriveCallbackRuntime(
  new DurableOAuthStateService(new PrismaDriveOAuthStateRepository(prisma)),
  new UnconfiguredGoogleOAuthClient(),
  new PersistentRefreshCredentialVault(
    { async seal() { throw new Error("OAUTH_NOT_CONFIGURED"); }, async open() { throw new Error("OAUTH_NOT_CONFIGURED"); } },
    new PrismaDriveCredentialEnvelopeRepository(prisma),
    { keyId: kmsKeyVersion.replace(/\/cryptoKeyVersions\/[^/]+$/, ""), keyVersion: kmsKeyVersion.split("/").at(-1)! },
  ),
  lifecycle,
);
const activation: PilotActivationConfiguration = {
  activationEnabled: false,
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
  oauthProviderConfigured: false,
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
