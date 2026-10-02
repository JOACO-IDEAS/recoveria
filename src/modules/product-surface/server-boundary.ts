import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import type { ProductSurfaceEvidenceField, ProductSurfaceInvoiceFilters, ProductSurfaceScope } from "./types";
import { PrismaProductSurfaceCheckpointReader } from "./prisma-checkpoint-reader";
import { ProductSurfaceQueryService } from "./read-model";
import { readCommittedPdfPreview } from "./document-preview";
import { founderSession } from "@/modules/connected-sources/founder-runtime";
import { founderRuntime } from "@/modules/connected-sources/founder-runtime";
import { readProviderBackedPreview } from "@/modules/staging/provider-preview";
import { RealGoogleDriveClient } from "@/modules/ingestion/real-google-drive-client";

export type ProductSurfaceServerResult<T> =
  | { readonly status: 200; readonly data: T }
  | { readonly status: 400 | 401 | 404 | 503; readonly error: "INVALID_REQUEST" | "UNAUTHORIZED" | "NOT_FOUND" | "NOT_CONFIGURED" };

const evidenceFields = new Set<ProductSurfaceEvidenceField>(["invoiceNumber", "issueDate", "documentedDueDate", "documentedNominalTotalCents", "currency", "entityCandidate"]);

function requiredEnvironment(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

export async function configuredProductSurfaceScope(database: Pick<PrismaClient, "connectedSource">): Promise<ProductSurfaceScope | null> {
  const organizationId = requiredEnvironment("RECOVERIA_PRODUCT_SURFACE_ORGANIZATION_ID");
  if (!organizationId) return null;
  const source = await database.connectedSource.findFirst({
    where: { organizationId, provider: "GOOGLE_DRIVE", providerRootReference: { not: null }, lastSuccessfulSyncAt: { not: null }, health: { not: "DISCONNECTED" } },
    orderBy: { lastSuccessfulSyncAt: "desc" },
    select: { organizationId: true, providerConnectionId: true },
  });
  return source ? { organizationId: source.organizationId, sourceType: "GOOGLE_DRIVE", sourceId: source.providerConnectionId, connectionId: source.providerConnectionId } : null;
}

export function parseInvoiceFilters(url: URL): ProductSurfaceInvoiceFilters | null {
  const allowed = new Set(["search", "issueDateFrom", "issueDateTo", "documentedNominalTotalCentsMin", "documentedNominalTotalCentsMax", "entityCandidate", "confidence", "reviewRequired", "duplicateStatus", "classification"]);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) return null;
  const number = (name: string): number | undefined | null => { const value = url.searchParams.get(name); if (value === null) return undefined; const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null; };
  const minimum = number("documentedNominalTotalCentsMin"), maximum = number("documentedNominalTotalCentsMax");
  if (minimum === null || maximum === null) return null;
  const confidence = url.searchParams.get("confidence");
  const review = url.searchParams.get("reviewRequired");
  const duplicate = url.searchParams.get("duplicateStatus");
  const classification = url.searchParams.get("classification");
  if (confidence && !["HIGH", "MEDIUM", "LOW", "UNAVAILABLE"].includes(confidence)) return null;
  if (review && !["true", "false"].includes(review)) return null;
  if (duplicate && !["NONE", "EXACT_DOCUMENT_DUPLICATE", "POSSIBLE_BUSINESS_DUPLICATE"].includes(duplicate)) return null;
  if (classification && !["FACT", "INFERENCE", "UNKNOWN"].includes(classification)) return null;
  return {
    ...(url.searchParams.get("search") ? { search: url.searchParams.get("search")! } : {}),
    ...(url.searchParams.get("issueDateFrom") ? { issueDateFrom: url.searchParams.get("issueDateFrom")! } : {}),
    ...(url.searchParams.get("issueDateTo") ? { issueDateTo: url.searchParams.get("issueDateTo")! } : {}),
    ...(minimum !== undefined ? { documentedNominalTotalCentsMin: minimum } : {}),
    ...(maximum !== undefined ? { documentedNominalTotalCentsMax: maximum } : {}),
    ...(url.searchParams.get("entityCandidate") ? { entityCandidate: url.searchParams.get("entityCandidate")! } : {}),
    ...(confidence ? { confidence: confidence as NonNullable<ProductSurfaceInvoiceFilters["confidence"]> } : {}),
    ...(review ? { reviewRequired: review === "true" } : {}),
    ...(duplicate ? { duplicateStatus: duplicate as NonNullable<ProductSurfaceInvoiceFilters["duplicateStatus"]> } : {}),
    ...(classification ? { classification: classification as NonNullable<ProductSurfaceInvoiceFilters["classification"]> } : {}),
  };
}

export function parseEvidenceField(value: string | null): ProductSurfaceEvidenceField | null {
  return value && evidenceFields.has(value as ProductSurfaceEvidenceField) ? value as ProductSurfaceEvidenceField : null;
}

let client: PrismaClient | undefined;
function productSurfaceContext(): { client: PrismaClient; service: ProductSurfaceQueryService } | null {
  const databaseUrl = requiredEnvironment("RECOVERIA_PRODUCT_SURFACE_DATABASE_URL");
  if (!databaseUrl) return null;
  client ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, max: 3 }) });
  return { client, service: new ProductSurfaceQueryService(new PrismaProductSurfaceCheckpointReader(client)) };
}

export async function executeProductSurfaceRead<T>(request: Request, operation: (service: ProductSurfaceQueryService, scope: ProductSurfaceScope) => Promise<T | null>): Promise<ProductSurfaceServerResult<T>> {
  let principal; try { principal = await founderSession(request); } catch { return { status: 401, error: "UNAUTHORIZED" }; }
  const context = productSurfaceContext();
  if (!context) return { status: 503, error: "NOT_CONFIGURED" };
  const scope = await configuredProductSurfaceScope(context.client);
  if (!scope) return { status: 503, error: "NOT_CONFIGURED" };
  if (scope.organizationId !== principal.organizationId) return { status: 401, error: "UNAUTHORIZED" };
  const value = await operation(context.service, scope);
  return value === null ? { status: 404, error: "NOT_FOUND" } : { status: 200, data: value };
}

export function productSurfaceResponse<T>(result: ProductSurfaceServerResult<T>): Response {
  return Response.json(result.status === 200 ? { data: result.data } : { error: result.error }, { status: result.status, headers: { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" } });
}

export async function productSurfaceDocumentResponse(request: Request, documentId: string): Promise<Response> {
  let principal; try { principal = await founderSession(request); } catch { return productSurfaceResponse({ status: 401, error: "UNAUTHORIZED" }); }
  const context = productSurfaceContext();
  if (!context) return productSurfaceResponse({ status: 503, error: "NOT_CONFIGURED" });
  const scope = await configuredProductSurfaceScope(context.client);
  if (!scope) return productSurfaceResponse({ status: 503, error: "NOT_CONFIGURED" });
  if (scope.organizationId !== principal.organizationId) return productSurfaceResponse({ status: 401, error: "UNAUTHORIZED" });
  if (process.env.RECOVERIA_ENVIRONMENT === "STAGING_SYNTHETIC") {
    const checkpoints = new PrismaProductSurfaceCheckpointReader(context.client); const loaded = await checkpoints.load(scope); const entry = loaded?.checkpoint.entries.find(item => item.source.sourceDocumentId === documentId); const runtime = founderRuntime(); const source = await runtime.sources.findByConnection(scope.organizationId, scope.connectionId); if (!entry || !source?.providerRootReference) return productSurfaceResponse({ status: 404, error: "NOT_FOUND" });
    const client = new RealGoogleDriveClient({ organizationId: scope.organizationId, connectionId: scope.connectionId, googleSubject: "server-verified", authorizedRootId: source.providerRootReference, authorizationState: "CONNECTED" }, runtime.credentialProvider, runtime.driveTransport);
    const result = await readProviderBackedPreview(principal, documentId, { find: async organizationId => organizationId === scope.organizationId ? { organizationId, connectionId: scope.connectionId, documentId, providerDocumentId: entry.source.sourceDocumentId, providerRootReference: source.providerRootReference!, displayName: entry.source.displayName, mimeType: entry.source.mimeType, fingerprintSha256: entry.source.fingerprintSha256, providerContentIdentity: entry.source.providerContentIdentity } : null }, { read: async input => { const metadata = await client.getMetadata(input.providerDocumentId); const bytes = await client.readPdfContent(input.providerDocumentId); return { bytes, mimeType: metadata.mimeType, rootMember: true, providerContentIdentity: metadata.providerContentIdentity }; } }, { record: async event => { console.log(JSON.stringify({ event: event.kind, outcome: event.outcome })); } });
    if (result.status !== 200) return Response.json({ error: result.error }, { status: result.status, headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } }); return productSurfacePdfResponse(result.bytes, result.displayName);
  }
  const directory = requiredEnvironment("RECOVERIA_PRODUCT_SURFACE_DOCUMENT_DIRECTORY"); if (!directory) return productSurfaceResponse({ status: 503, error: "NOT_CONFIGURED" });
  const result = await readCommittedPdfPreview(new PrismaProductSurfaceCheckpointReader(context.client), scope, documentId, directory);
  if (result.status !== 200) return Response.json({ error: result.error }, { status: result.status, headers: { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" } });
  return productSurfacePdfResponse(result.bytes, result.displayName);
}

export function productSurfacePdfResponse(bytes: Uint8Array, displayName: string): Response {
  return new Response(Uint8Array.from(bytes).buffer, { status: 200, headers: {
    "content-type": "application/pdf",
    "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(displayName)}`,
    "cache-control": "private, no-store, max-age=0",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; frame-ancestors 'self'; sandbox",
  } });
}
