import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function verifyMetaSignature(rawBody: Uint8Array, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=") || !appSecret) return false;
  const supplied = signatureHeader.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
}

export function verifySubscription(requestUrl: string, expectedToken: string): { ok: boolean; challenge?: string } {
  const url = new URL(requestUrl);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  return mode === "subscribe" && token === expectedToken && Boolean(challenge) ? { ok: true, challenge: challenge! } : { ok: false };
}

export function safeFailureCode(error: unknown): string {
  if (error instanceof Error && /^[A-Z0-9_]{3,80}$/.test(error.message)) return error.message;
  return "WHATSAPP_PROCESSING_FAILED";
}
