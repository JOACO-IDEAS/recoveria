import { createHmac, timingSafeEqual } from "node:crypto";
export interface InternalUserContext { readonly organizationId: string; readonly actorId: string; readonly sessionHash: string; readonly exp: number; readonly version: 1 }
const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
export function signInternalUserContext(context: InternalUserContext, secret: string): string { const body = encode(context); return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`; }
export function verifyInternalUserContext(value: string | null, secret: string, now = Date.now()): InternalUserContext {
  try { const [body, signature, extra] = value?.split(".") ?? []; if (!body || !signature || extra) throw new Error(); const expected = createHmac("sha256", secret).update(body).digest("base64url"); if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error(); const context = JSON.parse(Buffer.from(body, "base64url").toString()) as InternalUserContext; if (context.version !== 1 || context.exp <= now || context.exp > now + 60_000 || !context.organizationId || !context.actorId || !context.sessionHash) throw new Error(); return context; } catch { throw new Error("INTERNAL_USER_CONTEXT_INVALID"); }
}
