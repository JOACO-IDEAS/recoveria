import "dotenv/config";
import { createHmac } from "node:crypto";
import { assertLocalWhatsAppActivationEnvironment } from "../../src/modules/whatsapp-intelligence/activation-environment";

async function main() {
  assertLocalWhatsAppActivationEnvironment();
  const appSecret = process.env.META_APP_SECRET?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const endpoint = process.env.WHATSAPP_WEBHOOK_TEST_URL?.trim();
  if (!appSecret) throw new Error("META_APP_SECRET_NOT_CONFIGURED");
  if (!phoneNumberId || !/^\d{5,30}$/.test(phoneNumberId)) throw new Error("WHATSAPP_PHONE_NUMBER_ID_INVALID");
  if (!endpoint) throw new Error("WHATSAPP_WEBHOOK_TEST_URL_NOT_CONFIGURED");
  const url = new URL(endpoint);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("WHATSAPP_WEBHOOK_TEST_URL_INVALID");
  const payload = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: phoneNumberId, display_phone_number: "Meta official test number" },
      contacts: [{ wa_id: "5491100000099", profile: { name: "Contacto Sintético" } }],
      messages: [{ id: "wamid-recoveria-signed-activation-fixture", from: "5491100000099", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "Pagamos 850 mil de la factura 4567." } }],
    } }] }],
  });
  const signature = `sha256=${createHmac("sha256", appSecret).update(payload).digest("hex")}`;
  const rejected = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": `sha256=${"0".repeat(64)}` }, body: payload });
  if (rejected.status !== 401) throw new Error("WHATSAPP_INVALID_SIGNATURE_NOT_REJECTED");
  console.log(JSON.stringify({ ok: true, invalidSignatureRejected: true }));
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature }, body: payload });
    if (!response.ok) throw new Error(`WHATSAPP_SIGNED_FIXTURE_HTTP_${response.status}`);
    const body = await response.json() as { accepted?: number };
    if (body.accepted !== 1) throw new Error("WHATSAPP_SIGNED_FIXTURE_REJECTED");
    console.log(JSON.stringify({ ok: true, attempt, accepted: body.accepted }));
  }
}

main().catch(error => {
  const raw = error instanceof Error ? error.message : "";
  const code = /^[A-Z0-9_]{3,100}$/.test(raw) ? raw : "WHATSAPP_SIGNED_FIXTURE_FAILED";
  console.error(JSON.stringify({ ok: false, error: code }));
  process.exitCode = 1;
});
