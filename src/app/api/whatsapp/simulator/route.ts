import { runSimulation } from "@/modules/whatsapp-intelligence/simulator";
import { assertLocalWhatsAppActivationEnvironment, WHATSAPP_ACTIVATION_ORGANIZATION_ID } from "@/modules/whatsapp-intelligence/activation-environment";
import { readWhatsAppActivationSnapshot } from "@/modules/whatsapp-intelligence/activation-inspector";
import { safeFailureCode } from "@/modules/whatsapp-intelligence/security";
import { whatsAppRuntime } from "@/modules/whatsapp-intelligence/runtime";

export async function GET() {
  if (process.env.WHATSAPP_ACTIVATION_INSPECTOR_ENABLED !== "true") return Response.json({ error: "WHATSAPP_ACTIVATION_INSPECTOR_DISABLED" }, { status: 404 });
  try {
    assertLocalWhatsAppActivationEnvironment();
    const runtime = whatsAppRuntime();
    return Response.json(await readWhatsAppActivationSnapshot(runtime.prisma, WHATSAPP_ACTIVATION_ORGANIZATION_ID), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: safeFailureCode(error) }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  if (process.env.RECOVERIA_ENVIRONMENT && process.env.RECOVERIA_ENVIRONMENT !== "LOCAL") return Response.json({ error: "WHATSAPP_SIMULATOR_NOT_AVAILABLE" }, { status: 404 });
  try {
    const body = await request.json() as { scenarioId?: string; customMessage?: string };
    if (body.customMessage && body.customMessage.length > 4_000) return Response.json({ error: "WHATSAPP_SIMULATOR_INPUT_TOO_LARGE" }, { status: 413 });
    return Response.json(await runSimulation(body), { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "WHATSAPP_SIMULATOR_REQUEST_INVALID" }, { status: 400 }); }
}
