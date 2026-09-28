import { executeProductSurfaceRead, parseInvoiceFilters, productSurfaceResponse } from "@/modules/product-surface/server-boundary";

export async function GET(request: Request) {
  const filters = parseInvoiceFilters(new URL(request.url));
  if (!filters) return productSurfaceResponse({ status: 400, error: "INVALID_REQUEST" });
  return productSurfaceResponse(await executeProductSurfaceRead(request, (service, scope) => service.listInvoices(scope, filters)));
}
