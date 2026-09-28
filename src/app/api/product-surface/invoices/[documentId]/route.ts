import { executeProductSurfaceRead, productSurfaceResponse } from "@/modules/product-surface/server-boundary";

export async function GET(request: Request, context: RouteContext<"/api/product-surface/invoices/[documentId]">) {
  const { documentId } = await context.params;
  return productSurfaceResponse(await executeProductSurfaceRead(request, (service, scope) => service.getInvoice(scope, documentId)));
}
