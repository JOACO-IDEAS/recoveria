import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { GoogleCloudKmsManagedEncryptionProvider, GoogleOAuthHttpAdapter, GoogleSecretManagerAdapter } from "../../src/modules/ingestion/google-drive-cloud-adapters";
import { DurableDownloadSecurityAuditSink, ManagedKmsEncryptionAdapter, PersistentRefreshCredentialVault, RefreshingDriveCredentialProvider } from "../../src/modules/ingestion/google-drive-activation";
import { DeterministicDocumentUnderstandingProvider } from "../../src/modules/ingestion/document-understanding-provider";
import { toSanitizedDriveCorpusReport } from "../../src/modules/ingestion/google-drive-source-contract";
import { DurableGoogleDriveCallbackRuntime, DurableOAuthStateService } from "../../src/modules/ingestion/google-drive-durable-runtime";
import { composeRealGoogleDrivePilot, parseRealPilotCompositionConfiguration } from "../../src/modules/ingestion/google-drive-real-pilot-wiring";
import { BoundedGoogleDriveHttpTransport } from "../../src/modules/ingestion/google-drive-pilot-infrastructure";
import { PrismaDriveAuditRepository, PrismaDriveCheckpointRepository, PrismaDriveConnectionLifecycleRepository, PrismaDriveCredentialEnvelopeRepository, PrismaDriveOAuthStateRepository, PrismaDrivePilotExecutionRepository } from "../../src/modules/ingestion/google-drive-prisma-runtime";

const sanitizedFailure = (error: unknown): string => { const candidate = error instanceof Error ? error.message : "PILOT_RUN_FAILED"; return /^[A-Z0-9_]+$/.test(candidate) ? candidate : "PILOT_RUN_FAILED"; };
process.on("uncaughtException", error => { process.stderr.write(`${sanitizedFailure(error)}\n`); process.exit(1); });
process.on("unhandledRejection", error => { process.stderr.write(`${sanitizedFailure(error)}\n`); process.exit(1); });
const required = (name: string): string => { const value = process.env[name]?.trim(); if (!value) throw new Error(`PILOT_RUN_${name}_REQUIRED`); return value; };
if (process.env.GOOGLE_DRIVE_PILOT_ENABLED !== "true") { process.stderr.write("GOOGLE_DRIVE_PILOT_NOT_CONFIGURED\n"); process.exit(1); }
if (process.env.OPERATOR_CONFIRMED !== "RUN_SYNTHETIC_GOOGLE_DRIVE_PILOT") { process.stderr.write("PILOT_RUN_OPERATOR_CONFIRMATION_REQUIRED\n"); process.exit(1); }
const databaseUrl = required("RECOVERIA_PILOT_DATABASE_URL");
const expectedDatabase = required("EXPECTED_DATABASE");
if (expectedDatabase !== "recoveria_pilot") throw new Error("PILOT_RUN_DATABASE_IDENTITY_INVALID");

const configuration = parseRealPilotCompositionConfiguration(process.env);
const activation = configuration.activation;
if (!/^[A-Za-z0-9_-]{10,}$/.test(activation.authorizedRootId) || activation.authorizedRootId === "DRIVE_ROOT_NOT_CONFIGURED") throw new Error("PILOT_RUN_ROOT_ID_INVALID");
const expectedLimits = { expectedCorpusSize: 40, hardMaximumDownloads: 50, maximumExpansionRatio: 1.25, maximumPdfBytes: 25 * 1024 * 1024, maximumPages: 10, maximumRetryAttempts: 3, maximumExecutionDurationMs: 300_000 };
if (JSON.stringify(activation.limits) !== JSON.stringify(expectedLimits)) throw new Error("PILOT_RUN_LIMITS_NOT_APPROVED");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, max: 3 }) });
const identityPool = new Pool({ connectionString: databaseUrl, max: 1 });
const metadataAccessToken = async (): Promise<string> => {
  const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "Metadata-Flavor": "Google" } });
  if (!response.ok) throw new Error("GOOGLE_RUNTIME_IDENTITY_UNAVAILABLE");
  const payload = await response.json() as { access_token?: unknown };
  if (typeof payload.access_token !== "string") throw new Error("GOOGLE_RUNTIME_IDENTITY_UNAVAILABLE");
  return payload.access_token;
};
const authorizedJson = async (url: string, init: RequestInit = {}): Promise<Response> => fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await metadataAccessToken()}`, "Content-Type": "application/json" } });
const secrets = new GoogleSecretManagerAdapter({ async accessSecretVersion(resourceName) { const response = await authorizedJson(`https://secretmanager.googleapis.com/v1/${resourceName}:access`); if (!response.ok) return null; const payload = await response.json() as { payload?: { data?: unknown } }; return typeof payload.payload?.data === "string" ? new Uint8Array(Buffer.from(payload.payload.data, "base64")) : null; } });
const kmsProvider = new GoogleCloudKmsManagedEncryptionProvider({
  async encrypt(input) { const key = input.keyResource.replace(/\/cryptoKeyVersions\/[^/]+$/, ""); const response = await authorizedJson(`https://cloudkms.googleapis.com/v1/${key}:encrypt`, { method: "POST", body: JSON.stringify({ plaintext: Buffer.from(input.plaintext).toString("base64"), additionalAuthenticatedData: Buffer.from(input.additionalAuthenticatedData).toString("base64") }) }); if (!response.ok) throw new Error("KMS_FAILED"); const payload = await response.json() as { ciphertext?: unknown }; if (typeof payload.ciphertext !== "string") throw new Error("KMS_FAILED"); return new Uint8Array(Buffer.from(payload.ciphertext, "base64")); },
  async decrypt(input) { const key = input.keyResource.replace(/\/cryptoKeyVersions\/[^/]+$/, ""); const response = await authorizedJson(`https://cloudkms.googleapis.com/v1/${key}:decrypt`, { method: "POST", body: JSON.stringify({ ciphertext: Buffer.from(input.ciphertext).toString("base64"), additionalAuthenticatedData: Buffer.from(input.additionalAuthenticatedData).toString("base64") }) }); if (!response.ok) throw new Error("KMS_FAILED"); const payload = await response.json() as { plaintext?: unknown }; if (typeof payload.plaintext !== "string") throw new Error("KMS_FAILED"); return new Uint8Array(Buffer.from(payload.plaintext, "base64")); },
}, configuration.kmsResource);
const key = { keyId: configuration.kmsResource.replace(/\/cryptoKeyVersions\/[^/]+$/, ""), keyVersion: configuration.kmsResource.split("/").at(-1)! };
const lifecycle = new PrismaDriveConnectionLifecycleRepository(prisma);
const credentialRepository = new PrismaDriveCredentialEnvelopeRepository(prisma);
const vault = new PersistentRefreshCredentialVault(new ManagedKmsEncryptionAdapter({ configured: true, ...key }, kmsProvider), credentialRepository, key);
const oauth = new GoogleOAuthHttpAdapter(activation.googleClientId, activation.exactCallbackUrl, activation.googleClientSecretReference, secrets, async (url, init) => { const response = await fetch(url, init); return { status: response.status, body: response.body }; });
const callbackRuntime = new DurableGoogleDriveCallbackRuntime(new DurableOAuthStateService(new PrismaDriveOAuthStateRepository(prisma)), oauth, vault, lifecycle);

async function main(): Promise<void> {
  const database = await identityPool.query<{ name: string }>("SELECT current_database() AS name");
  if (database.rows[0]?.name !== expectedDatabase) throw new Error("PILOT_RUN_DATABASE_IDENTITY_MISMATCH");
  const [connection, envelope] = await Promise.all([lifecycle.load(activation.organizationId, activation.connectionId), credentialRepository.load(activation.organizationId, activation.connectionId)]);
  if (connection?.state !== "CONNECTED") throw new Error("PILOT_RUN_LIFECYCLE_NOT_CONNECTED");
  if (!envelope || envelope.grantedScopes.length !== 1 || envelope.grantedScopes[0] !== activation.requiredScope) throw new Error("PILOT_RUN_CREDENTIAL_METADATA_INVALID");
  const credentials = new RefreshingDriveCredentialProvider(activation.organizationId, activation.connectionId, vault, oauth, lifecycle);
  const transport = new BoundedGoogleDriveHttpTransport(async (url, init) => { const response = await fetch(url, init); return { ok: response.ok, status: response.status, headers: response.headers, body: response.body }; });
  const auditRepository = new PrismaDriveAuditRepository(prisma);
  const composition = composeRealGoogleDrivePilot({ configuration, callbackRuntime,
    driveConnection: { organizationId: activation.organizationId, connectionId: activation.connectionId, googleSubject: envelope.providerSubject, authorizedRootId: activation.authorizedRootId, authorizationState: "CONNECTED" },
    driveCredentials: credentials, driveTransport: transport, lifecycle,
    executions: new PrismaDrivePilotExecutionRepository(prisma), audit: executionId => new DurableDownloadSecurityAuditSink(auditRepository, executionId),
    understandingProvider: new DeterministicDocumentUnderstandingProvider(), checkpoints: new PrismaDriveCheckpointRepository(prisma) });
  const result = await composition.pilot.execute(activation, { operatorConfirmed: true, organizationId: activation.organizationId, connectionId: activation.connectionId, authorizedRootId: activation.authorizedRootId, configurationVersion: required("CONFIGURATION_VERSION") });
  process.stdout.write(`${JSON.stringify({ status: result.execution.status, checkpointVersion: result.checkpointVersion, ...toSanitizedDriveCorpusReport(result.report), identityClusters: result.report.summary.identityClusters, relationshipProposals: result.report.summary.relationshipProposals, exactDuplicates: result.report.summary.exactDuplicates, abstentions: result.report.summary.abstentions })}\n`);
}

void main().catch(error => { process.stderr.write(`${sanitizedFailure(error)}\n`); process.exitCode = 1; }).finally(async () => { await Promise.all([prisma.$disconnect(), identityPool.end()]); });
