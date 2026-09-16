import { createHmac, timingSafeEqual } from "node:crypto";
import { CommunicationProviderAttemptError } from "@/modules/communication-execution";
import type { CommunicationExecutionProvider, CommunicationExecutionProviderRequest, CommunicationExecutionProviderResult } from "@/modules/communication-execution";

export interface EmailHttpResponse { readonly status: number; readonly body: unknown }
export interface EmailHttpClient {
  post(input: { readonly url: string; readonly apiKey: string; readonly idempotencyKey: string; readonly body: Readonly<Record<string, unknown>> }): Promise<EmailHttpResponse>;
}

export class FetchEmailHttpClient implements EmailHttpClient {
  async post(input: { readonly url: string; readonly apiKey: string; readonly idempotencyKey: string; readonly body: Readonly<Record<string, unknown>> }): Promise<EmailHttpResponse> {
    const response = await fetch(input.url, { method: "POST", headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json", "idempotency-key": input.idempotencyKey }, body: JSON.stringify(input.body) });
    let body: unknown;
    try { body = await response.json(); } catch { body = undefined; }
    return { status: response.status, body };
  }
}

export interface ResendEmailProviderConfig {
  readonly apiKey?: string;
  readonly fromAddress?: string;
  readonly sendEnabled?: boolean;
  readonly allowedRecipients?: readonly string[];
}

export const resendConfigFromEnvironment = (environment: Readonly<Record<string, string | undefined>>): ResendEmailProviderConfig => ({
  apiKey: environment.RESEND_API_KEY,
  fromAddress: environment.RECOVERIA_EMAIL_FROM,
  sendEnabled: environment.RECOVERIA_REAL_PROVIDER_SEND_ENABLED === "true",
  allowedRecipients: (environment.RECOVERIA_EMAIL_RECIPIENT_ALLOWLIST ?? "").split(",").map(value => value.trim()).filter(Boolean),
});

const bounded = (value: unknown, limit = 200): string | undefined => typeof value === "string" && value.length > 0 && value.length <= limit ? value : undefined;

export class ResendEmailProvider implements CommunicationExecutionProvider {
  readonly id = "resend-email";
  private readonly allowlist: ReadonlySet<string>;

  constructor(private readonly config: ResendEmailProviderConfig, private readonly http: EmailHttpClient = new FetchEmailHttpClient()) {
    this.allowlist = new Set((config.allowedRecipients ?? []).map(value => value.trim().toLowerCase()));
  }

  async attempt(request: CommunicationExecutionProviderRequest): Promise<CommunicationExecutionProviderResult> {
    if (request.draft.channel !== "EMAIL" || request.email.to !== request.email.authorizedRecipient || request.draft.channelId !== request.email.authorizedChannelId) throw new CommunicationProviderAttemptError("Email destination does not match the authorized channel", "NOT_STARTED");
    if (!this.config.sendEnabled) throw new CommunicationProviderAttemptError("Real provider sending is disabled", "NOT_STARTED");
    if (!this.config.apiKey || !this.config.fromAddress) throw new CommunicationProviderAttemptError("Email provider credentials or sender are unavailable", "NOT_STARTED");
    if (!this.allowlist.has(request.email.to.trim().toLowerCase())) throw new CommunicationProviderAttemptError("Email recipient is not explicitly allowlisted", "NOT_STARTED");

    let response: EmailHttpResponse;
    try {
      response = await this.http.post({ url: "https://api.resend.com/emails", apiKey: this.config.apiKey, idempotencyKey: request.providerRequestKey, body: { from: this.config.fromAddress, to: [request.email.to], subject: request.email.subject, text: request.email.body, headers: { "X-RecoverIA-Request-Key": request.providerRequestKey } } });
    } catch {
      throw new CommunicationProviderAttemptError("Ambiguous email provider transport failure", "MAY_HAVE_STARTED");
    }

    if (response.status >= 200 && response.status < 300) {
      const messageId = bounded((response.body as { id?: unknown } | undefined)?.id);
      return messageId ? { status: "ACCEPTED", reasonCode: "PROVIDER_ACCEPTED", providerMessageId: messageId } : { status: "UNKNOWN", reasonCode: "MALFORMED_PROVIDER_ACCEPTANCE_RESPONSE" };
    }
    if (response.status >= 400 && response.status < 500) return { status: "FAILED", reasonCode: "PROVIDER_REJECTED_BEFORE_ACCEPTANCE" };
    return { status: "UNKNOWN", reasonCode: "AMBIGUOUS_PROVIDER_RESPONSE" };
  }
}

const webhookSecretBytes = (secret: string): Buffer => {
  const encoded = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const bytes = Buffer.from(encoded, "base64");
  if (!encoded || !bytes.length) throw new Error("Webhook secret is invalid");
  return bytes;
};

export const signResendWebhook = (secret: string, eventId: string, timestamp: string, rawBody: string): string => createHmac("sha256", webhookSecretBytes(secret)).update(`${eventId}.${timestamp}.${rawBody}`).digest("base64");

export function verifyResendWebhook(input: { readonly secret?: string; readonly eventId?: string; readonly timestamp?: string; readonly signature?: string; readonly rawBody: string }): void {
  if (!input.secret || !input.eventId || !input.timestamp || !input.signature) throw new Error("Webhook authenticity proof missing");
  const candidates = input.signature.split(" ").flatMap(part => part.split(",")).filter(part => part && part !== "v1");
  const expected = Buffer.from(signResendWebhook(input.secret, input.eventId, input.timestamp, input.rawBody));
  const valid = candidates.some(candidate => { const actual = Buffer.from(candidate); return actual.length === expected.length && timingSafeEqual(actual, expected); });
  if (!valid) throw new Error("Webhook signature invalid");
}
