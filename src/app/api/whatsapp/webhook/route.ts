import { parseMetaWebhook } from "@/modules/whatsapp-intelligence/meta-webhook";
import { requiredSecret } from "@/modules/whatsapp-intelligence/configuration";
import { safeFailureCode, verifyMetaSignature, verifySubscription } from "@/modules/whatsapp-intelligence/security";
import { whatsAppRuntime } from "@/modules/whatsapp-intelligence/runtime";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try { const result = verifySubscription(request.url, requiredSecret(process.env, "WHATSAPP_VERIFY_TOKEN")); return result.ok ? new Response(result.challenge, { status: 200, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } }) : new Response("Forbidden", { status: 403 }); }
  catch { return new Response("Not configured", { status: 503 }); }
}

export async function POST(request: Request) {
  if (process.env.WHATSAPP_CONNECTOR_ENABLED !== "true") return Response.json({ error: "WHATSAPP_CONNECTOR_DISABLED" }, { status: 503 });
  try {
    const rawBody = new Uint8Array(await request.arrayBuffer());
    if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"), requiredSecret(process.env, "META_APP_SECRET"))) return Response.json({ error: "WHATSAPP_SIGNATURE_INVALID" }, { status: 401 });
    const runtime = whatsAppRuntime(); const messages = await parseMetaWebhook(rawBody, runtime.registry);
    for (const message of messages) await runtime.processor.receive(message);
    return Response.json({ accepted: messages.length }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: safeFailureCode(error) }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
}
