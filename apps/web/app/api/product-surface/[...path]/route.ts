import { stagingBff } from "@/lib/staging-bff";
export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) { return stagingBff(request, ["api", "product-surface", ...(await context.params).path]); }
