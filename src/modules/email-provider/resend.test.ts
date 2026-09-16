import { describe, expect, it } from "vitest";
import type { CommunicationExecutionProviderRequest } from "@/modules/communication-execution";
import { ResendEmailProvider, resendConfigFromEnvironment } from ".";
import type { EmailHttpClient, EmailHttpResponse } from ".";

const request: CommunicationExecutionProviderRequest = {
  providerRequestKey: "communication-provider:synthetic",
  draft: { id: "draft", requestId: "request", organizationId: "org", caseId: "case", contactId: "contact", channelId: "channel", intent: "INITIAL_COLLECTION_CONTACT", subject: "Synthetic subject", body: "Synthetic body", channel: "EMAIL", createdAt: "2026-09-16T00:00:00.000Z", draftingMethod: "DETERMINISTIC_TEMPLATE", factRefs: [], evidenceRefs: [], warnings: [], requiresHumanApproval: true, snapshotFingerprint: "fingerprint" },
  email: { authorizedChannelId: "channel", authorizedRecipient: "synthetic@example.invalid", to: "synthetic@example.invalid", subject: "Synthetic subject", body: "Synthetic body" },
};

class FakeHttp implements EmailHttpClient {
  calls = 0;
  requests: Parameters<EmailHttpClient["post"]>[0][] = [];
  constructor(private readonly response: () => Promise<EmailHttpResponse>) {}
  async post(input: Parameters<EmailHttpClient["post"]>[0]) { this.calls += 1; this.requests.push(input); return this.response(); }
}

const enabled = (http: EmailHttpClient) => new ResendEmailProvider({ apiKey: "synthetic-key", fromAddress: "sender@example.invalid", sendEnabled: true, allowedRecipients: ["synthetic@example.invalid"] }, http);

describe("Phase 5B.4C Resend email provider boundary", () => {
  it("fails closed without enablement, credentials, and recipient allowlisting without network", async () => {
    expect(resendConfigFromEnvironment({})).toMatchObject({ sendEnabled: false, allowedRecipients: [] });
    for (const config of [{}, { sendEnabled: true }, { sendEnabled: true, apiKey: "synthetic", fromAddress: "sender@example.invalid" }]) {
      const http = new FakeHttp(async () => { throw new Error("network must not be reached"); });
      await expect(new ResendEmailProvider(config, http).attempt(request)).rejects.toMatchObject({ transmission: "NOT_STARTED" });
      expect(http.calls).toBe(0);
    }
  });

  it("rejects recipient and channel substitution before network", async () => {
    const http = new FakeHttp(async () => ({ status: 200, body: { id: "provider-message" } }));
    const provider = enabled(http);
    await expect(provider.attempt({ ...request, email: { ...request.email, to: "substitute@example.invalid" } })).rejects.toMatchObject({ transmission: "NOT_STARTED" });
    await expect(provider.attempt({ ...request, draft: { ...request.draft, channelId: "other-channel" } })).rejects.toMatchObject({ transmission: "NOT_STARTED" });
    expect(http.calls).toBe(0);
  });

  it("maps positive provider acknowledgement to ACCEPTED and preserves idempotency", async () => {
    const http = new FakeHttp(async () => ({ status: 200, body: { id: "provider-message" } }));
    expect(await enabled(http).attempt(request)).toEqual({ status: "ACCEPTED", reasonCode: "PROVIDER_ACCEPTED", providerMessageId: "provider-message" });
    expect(http.calls).toBe(1);
    expect(http.requests[0]).toMatchObject({ idempotencyKey: request.providerRequestKey, body: { to: [request.email.to], subject: request.email.subject, text: request.email.body } });
  });

  it("maps explicit rejection to FAILED and ambiguous outcomes to UNKNOWN", async () => {
    expect(await enabled(new FakeHttp(async () => ({ status: 422, body: {} }))).attempt(request)).toMatchObject({ status: "FAILED" });
    expect(await enabled(new FakeHttp(async () => ({ status: 200, body: {} }))).attempt(request)).toMatchObject({ status: "UNKNOWN", reasonCode: "MALFORMED_PROVIDER_ACCEPTANCE_RESPONSE" });
    expect(await enabled(new FakeHttp(async () => ({ status: 503, body: {} }))).attempt(request)).toMatchObject({ status: "UNKNOWN" });
    await expect(enabled(new FakeHttp(async () => { throw new Error("synthetic connection drop"); })).attempt(request)).rejects.toMatchObject({ transmission: "MAY_HAVE_STARTED" });
  });
});
