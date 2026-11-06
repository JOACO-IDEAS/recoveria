import { runSimulation } from "@/modules/whatsapp-intelligence/simulator";

export async function POST(request: Request) {
  if (process.env.RECOVERIA_ENVIRONMENT && process.env.RECOVERIA_ENVIRONMENT !== "LOCAL") return Response.json({ error: "WHATSAPP_SIMULATOR_NOT_AVAILABLE" }, { status: 404 });
  try {
    const body = await request.json() as { scenarioId?: string; customMessage?: string };
    if (body.customMessage && body.customMessage.length > 4_000) return Response.json({ error: "WHATSAPP_SIMULATOR_INPUT_TOO_LARGE" }, { status: 413 });
    return Response.json(await runSimulation(body), { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "WHATSAPP_SIMULATOR_REQUEST_INVALID" }, { status: 400 }); }
}
