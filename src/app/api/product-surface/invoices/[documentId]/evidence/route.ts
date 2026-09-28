import { executeProductSurfaceRead, parseEvidenceField, productSurfaceResponse } from "@/modules/product-surface/server-boundary";

export async function GET(request: Request, context: RouteContext<"/api/product-surface/invoices/[documentId]/evidence">) {
  const field = parseEvidenceField(new URL(request.url).searchParams.get("field"));
  if (!field) return productSurfaceResponse({ status: 400, error: "INVALID_REQUEST" });
  const { documentId } = await context.params;
  return productSurfaceResponse(await executeProductSurfaceRead(request, (service, scope) => service.getEvidence(scope, documentId, field)));
}
