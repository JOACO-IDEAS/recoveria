import "dotenv/config";
import { createServer } from "node:http";
import { assertLocalWhatsAppActivationEnvironment } from "../../src/modules/whatsapp-intelligence/activation-environment";

assertLocalWhatsAppActivationEnvironment();

const listenPort = 3101;
const targetOrigin = "http://127.0.0.1:3000";
const maximumBodyBytes = 2 * 1024 * 1024;

const server = createServer(async (request, response) => {
  try {
    const incoming = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    if (incoming.pathname !== "/api/whatsapp/webhook" || (request.method !== "GET" && request.method !== "POST")) {
      response.writeHead(404, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ error: "NOT_FOUND" }));
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += value.byteLength;
      if (size > maximumBodyBytes) throw new Error("WHATSAPP_GATEWAY_PAYLOAD_TOO_LARGE");
      chunks.push(value);
    }
    const headers = new Headers();
    for (const name of ["content-type", "x-hub-signature-256"]) {
      const value = request.headers[name];
      if (typeof value === "string") headers.set(name, value);
    }
    const upstream = await fetch(`${targetOrigin}${incoming.pathname}${incoming.search}`, {
      method: request.method,
      headers,
      body: request.method === "POST" ? Buffer.concat(chunks) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    response.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-store",
    });
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    const code = error instanceof Error && /^[A-Z0-9_]{3,80}$/.test(error.message) ? error.message : "WHATSAPP_GATEWAY_FAILED";
    response.writeHead(code === "WHATSAPP_GATEWAY_PAYLOAD_TOO_LARGE" ? 413 : 502, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ error: code }));
  }
});

server.listen(listenPort, "127.0.0.1", () => console.log(JSON.stringify({ ok: true, listening: `http://127.0.0.1:${listenPort}/api/whatsapp/webhook` })));

for (const signal of ["SIGINT", "SIGTERM"] as const) server.on("listening", () => process.once(signal, () => server.close(() => process.exit(0))));
