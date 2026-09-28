import { timingSafeEqual } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import type { ProductSurfaceEvidenceField, ProductSurfaceInvoiceFilters, ProductSurfaceScope } from "./types";
import { PrismaProductSurfaceCheckpointReader } from "./prisma-checkpoint-reader";
import { ProductSurfaceQueryService } from "./read-model";

export type ProductSurfaceServerResult<T> =
  | { readonly status: 200; readonly data: T }
  | { readonly status: 400 | 401 | 404 | 503; readonly error: "INVALID_REQUEST" | "UNAUTHORIZED" | "NOT_FOUND" | "NOT_CONFIGURED" };

const evidenceFields = new Set<ProductSurfaceEvidenceField>(["invoiceNumber", "issueDate", "documentedDueDate", "documentedNominalTotalCents", "currency", "entityCandidate"]);

function requiredEnvironment(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

export function authorizeProductSurface(request: Request, expectedToken: string | null = requiredEnvironment("RECOVERIA_PRODUCT_SURFACE_API_TOKEN")): boolean {
  const supplied = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{32,})$/)?.[1];
  if (!expectedToken || !supplied) return false;
  const left = Buffer.from(supplied); const right = Buffer.from(expectedToken);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function configuredProductSurfaceScope(): ProductSurfaceScope | null {
  const organizationId = requiredEnvironment("RECOVERIA_PRODUCT_SURFACE_ORGANIZATION_ID");
  const sourceId = requiredEnvironment("RECOVERIA_PRODUCT_SURFACE_SOURCE_ID");
  const connectionId = requiredEnvironment("RECOVERIA_PRODUCT_SURFACE_CONNECTION_ID");
  return organizationId && sourceId && connectionId ? { organizationId, sourceType: "GOOGLE_DRIVE", sourceId, connectionId } : null;
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
export function productSurfaceService(): ProductSurfaceQueryService | null {
  const databaseUrl = requiredEnvironment("RECOVERIA_PRODUCT_SURFACE_DATABASE_URL");
  if (!databaseUrl) return null;
  client ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, max: 3 }) });
  return new ProductSurfaceQueryService(new PrismaProductSurfaceCheckpointReader(client));
}

export async function executeProductSurfaceRead<T>(request: Request, operation: (service: ProductSurfaceQueryService, scope: ProductSurfaceScope) => Promise<T | null>): Promise<ProductSurfaceServerResult<T>> {
  if (!authorizeProductSurface(request)) return { status: 401, error: "UNAUTHORIZED" };
  const scope = configuredProductSurfaceScope(); const service = productSurfaceService();
  if (!scope || !service) return { status: 503, error: "NOT_CONFIGURED" };
  const value = await operation(service, scope);
  return value === null ? { status: 404, error: "NOT_FOUND" } : { status: 200, data: value };
}

export function productSurfaceResponse<T>(result: ProductSurfaceServerResult<T>): Response {
  return Response.json(result.status === 200 ? { data: result.data } : { error: result.error }, { status: result.status, headers: { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" } });
}
