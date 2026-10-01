import { stagingBff } from "@/lib/staging-bff";
type Context = { params: Promise<{ path: string[] }> };
const handle = async (request: Request, context: Context) => stagingBff(request, (await context.params).path);
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
