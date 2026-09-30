import { productSurfaceDocumentResponse } from "@/modules/product-surface/server-boundary";

export async function GET(request: Request, context: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await context.params;
  return productSurfaceDocumentResponse(request, documentId);
}
