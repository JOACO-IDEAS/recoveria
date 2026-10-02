import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  GoogleCloudKmsManagedEncryptionProvider,
  GoogleOAuthHttpAdapter,
  GoogleSecretManagerAdapter,
} from "@/modules/ingestion/google-drive-cloud-adapters";
import {
  DurableDownloadSecurityAuditSink,
  ManagedKmsEncryptionAdapter,
  PersistentRefreshCredentialVault,
  RefreshingDriveCredentialProvider,
} from "@/modules/ingestion/google-drive-activation";
import { DeterministicDocumentUnderstandingProvider } from "@/modules/ingestion/document-understanding-provider";
import { toSanitizedDriveCorpusReport } from "@/modules/ingestion/google-drive-source-contract";
import { DurableGoogleDriveCallbackRuntime, DurableOAuthStateService } from "@/modules/ingestion/google-drive-durable-runtime";
import { composeRealGoogleDrivePilot, parseRealPilotCompositionConfiguration } from "@/modules/ingestion/google-drive-real-pilot-wiring";
import { BoundedGoogleDriveHttpTransport, GOOGLE_DRIVE_READONLY_SCOPE } from "@/modules/ingestion/google-drive-pilot-infrastructure";
import {
  PrismaDriveAuditRepository,
  PrismaDriveCheckpointRepository,
  PrismaDriveConnectionLifecycleRepository,
  PrismaDriveCredentialEnvelopeRepository,
  PrismaDriveOAuthStateRepository,
  PrismaDrivePilotExecutionRepository,
} from "@/modules/ingestion/google-drive-prisma-runtime";
import { toFirstValueSummary, type ConnectedSourceSyncSummary } from "./product-contract";
import { PrismaConnectedSourceRepository, PrismaSyncIntentRepository } from "./prisma-repository";
import {
  ConnectedSourceService,
  createGooglePickerBootstrap,
  type GoogleFolderValidator,
  type ProductActor,
} from "./service";
import { PrismaFolderCandidateRepository } from "./prisma-folder-candidate";
import { STAGING_SESSION_COOKIE } from "@/modules/staging/auth";
import { stagingAuthRuntime } from "@/modules/staging/runtime-auth";
import { MetadataAccessTokenProvider } from "@/modules/staging/cloud-tasks";

const ORGANIZATION_ID = "recoveria-synthetic-pilot";
const CONNECTION_ID = "google-drive-pilot";

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`CONNECTED_SOURCE_${name}_REQUIRED`);
  return value;
};

interface DriveFolderMetadata { readonly id?: string; readonly name?: string; readonly mimeType?: string; readonly trashed?: boolean; readonly driveId?: string }

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "CONNECTED_SOURCE_OPERATION_FAILED";
  return /^[A-Z0-9_]+$/.test(message) ? message : "CONNECTED_SOURCE_OPERATION_FAILED";
}

const cloudIdentity = new MetadataAccessTokenProvider();

async function cloudHeaders(): Promise<Record<string, string>> {
  const localToken = process.env.CONNECTED_SOURCE_GOOGLE_CLOUD_ACCESS_TOKEN?.trim();
  const token = localToken || await cloudIdentity.get();
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function assertConfiguration(): void {
  if (required("CONNECTED_SOURCE_DATABASE_URL").includes("concilia")) throw new Error("CONNECTED_SOURCE_DATABASE_TARGET_REJECTED");
  if (new URL(required("CONNECTED_SOURCE_DATABASE_URL")).pathname !== "/recoveria_pilot") throw new Error("CONNECTED_SOURCE_DATABASE_TARGET_REJECTED");
  if (required("CONNECTED_SOURCE_APPROVED_ROOT_ID") !== required("CONNECTED_SOURCE_SOURCE_ID")) throw new Error("CONNECTED_SOURCE_ROOT_BINDING_REJECTED");
  if (required("CONNECTED_SOURCE_ORGANIZATION_ID") !== ORGANIZATION_ID || required("CONNECTED_SOURCE_CONNECTION_ID") !== CONNECTION_ID) throw new Error("CONNECTED_SOURCE_IDENTITY_REJECTED");
}

export class FounderConnectedSourceRuntime {
  readonly prisma: PrismaClient;
  readonly sources: PrismaConnectedSourceRepository;
  readonly lifecycle: PrismaDriveConnectionLifecycleRepository;
  readonly credentials: PrismaDriveCredentialEnvelopeRepository;
  readonly service: ConnectedSourceService;
  readonly credentialProvider: RefreshingDriveCredentialProvider;
  readonly driveTransport: BoundedGoogleDriveHttpTransport;
  readonly configuration: ReturnType<typeof parseRealPilotCompositionConfiguration>;
  readonly approvedRootId: string;
  readonly pickerApiKey: string;
  readonly appId: string;
  #lastSummary?: ConnectedSourceSyncSummary;

  constructor() {
    assertConfiguration();
    const databaseUrl = required("CONNECTED_SOURCE_DATABASE_URL");
    this.approvedRootId = required("CONNECTED_SOURCE_APPROVED_ROOT_ID");
    this.pickerApiKey = process.env.CONNECTED_SOURCE_PICKER_API_KEY?.trim() ?? "";
    this.appId = process.env.CONNECTED_SOURCE_GOOGLE_APP_ID?.trim() ?? "";
    this.prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, max: 4 }) });
    this.sources = new PrismaConnectedSourceRepository(this.prisma);
    this.lifecycle = new PrismaDriveConnectionLifecycleRepository(this.prisma);
    this.credentials = new PrismaDriveCredentialEnvelopeRepository(this.prisma);

    const authorizedJson = async (url: string, init: RequestInit = {}): Promise<Response> => fetch(url, { ...init, headers: { ...await cloudHeaders(), ...init.headers }, cache: "no-store" });
    const secrets = new GoogleSecretManagerAdapter({ async accessSecretVersion(resourceName) {
      const response = await authorizedJson(`https://secretmanager.googleapis.com/v1/${resourceName}:access`);
      if (!response.ok) return null;
      const payload = await response.json() as { payload?: { data?: unknown } };
      return typeof payload.payload?.data === "string" ? new Uint8Array(Buffer.from(payload.payload.data, "base64")) : null;
    } });
    const kmsResource = required("CONNECTED_SOURCE_KMS_KEY_VERSION");
    const kmsProvider = new GoogleCloudKmsManagedEncryptionProvider({
      async encrypt(input) {
        const key = input.keyResource.replace(/\/cryptoKeyVersions\/[^/]+$/, "");
        const response = await authorizedJson(`https://cloudkms.googleapis.com/v1/${key}:encrypt`, { method: "POST", body: JSON.stringify({ plaintext: Buffer.from(input.plaintext).toString("base64"), additionalAuthenticatedData: Buffer.from(input.additionalAuthenticatedData).toString("base64") }) });
        if (!response.ok) throw new Error("KMS_FAILED");
        const payload = await response.json() as { ciphertext?: unknown };
        if (typeof payload.ciphertext !== "string") throw new Error("KMS_FAILED");
        return new Uint8Array(Buffer.from(payload.ciphertext, "base64"));
      },
      async decrypt(input) {
        const key = input.keyResource.replace(/\/cryptoKeyVersions\/[^/]+$/, "");
        const response = await authorizedJson(`https://cloudkms.googleapis.com/v1/${key}:decrypt`, { method: "POST", body: JSON.stringify({ ciphertext: Buffer.from(input.ciphertext).toString("base64"), additionalAuthenticatedData: Buffer.from(input.additionalAuthenticatedData).toString("base64") }) });
        if (!response.ok) throw new Error("KMS_FAILED");
        const payload = await response.json() as { plaintext?: unknown };
        if (typeof payload.plaintext !== "string") throw new Error("KMS_FAILED");
        return new Uint8Array(Buffer.from(payload.plaintext, "base64"));
      },
    }, kmsResource);
    const key = { keyId: kmsResource.replace(/\/cryptoKeyVersions\/[^/]+$/, ""), keyVersion: kmsResource.split("/").at(-1)! };
    const vault = new PersistentRefreshCredentialVault(new ManagedKmsEncryptionAdapter({ configured: true, ...key }, kmsProvider), this.credentials, key);
    const oauth = new GoogleOAuthHttpAdapter(required("CONNECTED_SOURCE_GOOGLE_CLIENT_ID"), required("CONNECTED_SOURCE_CALLBACK_URL"), required("CONNECTED_SOURCE_GOOGLE_CLIENT_SECRET_REFERENCE"), secrets, async (url, init) => {
      const response = await fetch(url, init);
      return { status: response.status, body: response.body };
    });
    this.credentialProvider = new RefreshingDriveCredentialProvider(ORGANIZATION_ID, CONNECTION_ID, vault, oauth, this.lifecycle);
    this.driveTransport = new BoundedGoogleDriveHttpTransport(async (url, init) => {
      const response = await fetch(url, init);
      return { ok: response.ok, status: response.status, headers: response.headers, body: response.body };
    });
    this.configuration = parseRealPilotCompositionConfiguration({
      ACTIVATION_ENABLED: "true",
      GOOGLE_CLIENT_ID: required("CONNECTED_SOURCE_GOOGLE_CLIENT_ID"),
      GOOGLE_CLIENT_SECRET_REFERENCE: required("CONNECTED_SOURCE_GOOGLE_CLIENT_SECRET_REFERENCE"),
      EXACT_CALLBACK_URL: required("CONNECTED_SOURCE_CALLBACK_URL"),
      REQUIRED_SCOPE: GOOGLE_DRIVE_READONLY_SCOPE,
      ORGANIZATION_ID,
      CONNECTION_ID,
      AUTHORIZED_ROOT_ID: this.approvedRootId,
      EXPECTED_CORPUS_SIZE: "40",
      HARD_MAXIMUM_DOWNLOADS: "50",
      MAXIMUM_EXPANSION_RATIO: "1.25",
      MAXIMUM_PDF_BYTES: String(25 * 1024 * 1024),
      MAXIMUM_PAGES: "10",
      MAXIMUM_RETRY_ATTEMPTS: "3",
      MAXIMUM_EXECUTION_DURATION_MS: "300000",
      AUDIT_PERSISTENCE_CONFIGURED: "true",
      CREDENTIAL_VAULT_CONFIGURED: "true",
      CHECKPOINT_PERSISTENCE_CONFIGURED: "true",
      OAUTH_PROVIDER_CONFIGURED: "true",
      ENCRYPTION_CONFIGURED: "true",
      OPERATOR_ID: required("RECOVERIA_FOUNDER_ACTOR_ID"),
      CALLBACK_PATH: "/oauth/google/callback",
      KMS_RESOURCE: kmsResource,
    });
    const callback = new DurableGoogleDriveCallbackRuntime(new DurableOAuthStateService(new PrismaDriveOAuthStateRepository(this.prisma)), oauth, vault, this.lifecycle);
    const folderValidator: GoogleFolderValidator = { validate: async ({ organizationId, connectionId, untrustedFolderId }) => {
      if (organizationId !== ORGANIZATION_ID || connectionId !== CONNECTION_ID || untrustedFolderId !== this.approvedRootId) throw new Error("CONNECTED_SOURCE_FOLDER_OUTSIDE_APPROVED_ROOT");
      const token = await this.credentialProvider.getValidAccessToken(CONNECTION_ID);
      const metadata = await this.driveTransport.execute<DriveFolderMetadata>({ operation: "FILES_GET", accessToken: token.value, parameters: { fileId: untrustedFolderId, supportsAllDrives: false, fields: "id,name,mimeType,trashed,driveId" } });
      if (metadata.id !== this.approvedRootId || metadata.mimeType !== "application/vnd.google-apps.folder" || metadata.trashed !== false || metadata.driveId || !metadata.name) throw new Error("CONNECTED_SOURCE_FOLDER_VALIDATION_FAILED");
      return { providerRootReference: this.approvedRootId, safeDisplayName: metadata.name.slice(0, 120), mimeType: "application/vnd.google-apps.folder", trashed: false, location: "MY_DRIVE" };
    } };
    this.service = new ConnectedSourceService(this.sources, new PrismaFolderCandidateRepository(this.prisma, CONNECTION_ID), folderValidator, { execute: async input => {
      if (input.organizationId !== ORGANIZATION_ID || input.connectionId !== CONNECTION_ID || input.providerRootReference !== this.approvedRootId || input.rootBoundaryVersion < 1 || input.actorId !== required("RECOVERIA_FOUNDER_ACTOR_ID")) throw new Error("CONNECTED_SOURCE_SYNC_BINDING_REJECTED");
      const envelope = await this.credentials.load(ORGANIZATION_ID, CONNECTION_ID);
      if (!envelope || envelope.grantedScopes.length !== 1 || envelope.grantedScopes[0] !== GOOGLE_DRIVE_READONLY_SCOPE) throw new Error("CONNECTED_SOURCE_SCOPE_REJECTED");
      const composition = composeRealGoogleDrivePilot({
        configuration: this.configuration,
        callbackRuntime: callback,
        driveConnection: { organizationId: ORGANIZATION_ID, connectionId: CONNECTION_ID, googleSubject: envelope.providerSubject, authorizedRootId: this.approvedRootId, authorizationState: "CONNECTED" },
        driveCredentials: this.credentialProvider,
        driveTransport: this.driveTransport,
        lifecycle: this.lifecycle,
        executions: new PrismaDrivePilotExecutionRepository(this.prisma),
        audit: executionId => new DurableDownloadSecurityAuditSink(new PrismaDriveAuditRepository(this.prisma), executionId),
        understandingProvider: new DeterministicDocumentUnderstandingProvider(),
        checkpoints: new PrismaDriveCheckpointRepository(this.prisma),
      });
      const result = await composition.pilot.execute(this.configuration.activation, { operatorConfirmed: true, organizationId: ORGANIZATION_ID, connectionId: CONNECTION_ID, authorizedRootId: this.approvedRootId, configurationVersion: "6B.3-connected-source-v1", executionId: input.executionId });
      const report = toSanitizedDriveCorpusReport(result.report);
      const summary = { ...toFirstValueSummary({ report, exactDuplicates: result.report.summary.exactDuplicates, possibleDuplicates: result.report.summary.possibleDuplicates, detectedEntities: result.report.summary.identityClusters }), documentsDiscovered: report.filesDiscovered, documentsDownloaded: result.execution.downloadedCount, documentsUnderstood: report.understoodFiles, documentsReused: report.reusedFiles, failures: report.failedFiles, checkpointVersion: result.checkpointVersion };
      this.#lastSummary = summary;
      return summary;
    } }, () => new Date(), new PrismaSyncIntentRepository(this.prisma));
  }

  async initialize() {
    await this.prisma.organization.upsert({ where: { id: ORGANIZATION_ID }, update: {}, create: { id: ORGANIZATION_ID, name: "Recoveria Synthetic Pilot" } });
    const lifecycle = await this.lifecycle.load(ORGANIZATION_ID, CONNECTION_ID);
    const envelope = await this.credentials.load(ORGANIZATION_ID, CONNECTION_ID);
    if (lifecycle?.state !== "CONNECTED" || !envelope || envelope.grantedScopes.length !== 1 || envelope.grantedScopes[0] !== GOOGLE_DRIVE_READONLY_SCOPE) throw new Error("CONNECTED_SOURCE_OAUTH_NOT_READY");
    return this.service.ensureConnection(ORGANIZATION_ID, CONNECTION_ID);
  }

  async status() {
    const source = await this.initialize();
    return { source: this.service.productView(source), lastSummary: this.#lastSummary };
  }

  async pickerBootstrap() {
    if (!this.pickerApiKey || !this.appId) throw new Error("CONNECTED_SOURCE_PICKER_CONFIGURATION_REQUIRED");
    await this.initialize();
    const token = await this.credentialProvider.getValidAccessToken(CONNECTION_ID);
    return createGooglePickerBootstrap({ apiKey: this.pickerApiKey, appId: this.appId, accessToken: token.value, accessTokenExpiresAt: new Date(Date.now() + 50 * 60_000).toISOString() });
  }
}

let runtime: FounderConnectedSourceRuntime | undefined;
export function founderRuntime(): FounderConnectedSourceRuntime { return runtime ??= new FounderConnectedSourceRuntime(); }
function cookieValue(request: Request): string | undefined { return request.headers.get("x-recoveria-browser-session") ?? request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith(`${STAGING_SESSION_COOKIE}=`))?.slice(STAGING_SESSION_COOKIE.length + 1); }
export async function founderSession(request: Request): Promise<ProductActor> { const auth = stagingAuthRuntime(); const session = await auth.sessions.authenticate(cookieValue(request)); if (!(await auth.memberships.active(session.organizationId, session.actorId))) throw new Error("FOUNDER_MEMBERSHIP_REQUIRED"); return { organizationId: session.organizationId, actorId: session.actorId, sessionId: session.sid, csrfToken: session.csrf }; }
export async function assertCsrf(request: Request, session: ProductActor): Promise<void> { const auth = stagingAuthRuntime(); const authenticated = await auth.sessions.authenticate(cookieValue(request)); if (authenticated.sid !== session.sessionId) throw new Error("FOUNDER_SESSION_BINDING_MISMATCH"); auth.sessions.assertCsrf(authenticated, request.headers.get("x-csrf-token")); }
export function sanitizedRuntimeError(error: unknown): string { return safeError(error); }
