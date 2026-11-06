import { whatsAppRuntime } from "../../src/modules/whatsapp-intelligence/runtime";

async function main() {
  if (process.env.WHATSAPP_CONNECTOR_ENABLED !== "true") throw new Error("WHATSAPP_CONNECTOR_DISABLED");
  const runtime = whatsAppRuntime(); let processed = 0; const failures: Record<string, number> = {};
  while (true) { const result = await runtime.processor.workOne(); if (!result.processed) break; processed += 1; if (result.failureCode) failures[result.failureCode] = (failures[result.failureCode] ?? 0) + 1; }
  console.log(JSON.stringify({ ok: true, processed, failures }));
  await runtime.prisma.$disconnect();
}
main().catch(error => { const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "WHATSAPP_WORKER_FAILED"; console.error(JSON.stringify({ ok: false, error: code })); process.exitCode = 1; });
