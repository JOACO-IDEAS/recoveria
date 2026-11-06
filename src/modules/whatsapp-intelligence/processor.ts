import { safeFailureCode } from "./security";
import type { RecoveriaCrmAdapter } from "./crm-adapter";
import { synchronizeInterpretationWithCrm } from "./crm-orchestration";
import type { ConversationInterpreter } from "./interpreter";
import type { WhatsAppIntelligenceStore } from "./store";
import type { IncomingWhatsAppMessage, ProcessingOutcome, UsageLimits } from "./types";

export interface WhatsAppProcessorConfiguration { readonly limits: UsageLimits; readonly maxAttempts: number; readonly retryBaseMs: number }

export class WhatsAppIntelligenceProcessor {
  constructor(private readonly store: WhatsAppIntelligenceStore, private readonly interpreter: ConversationInterpreter, private readonly crm: RecoveriaCrmAdapter, private readonly configuration: WhatsAppProcessorConfiguration, private readonly now: () => Date = () => new Date()) {}

  async receive(message: IncomingWhatsAppMessage): Promise<ProcessingOutcome> {
    const accepted = await this.store.accept(message);
    if (!accepted.inserted) return { duplicate: true, message: accepted.message, event: await this.store.eventForMessage(message.metaMessageId) ?? undefined, warnings: ["DUPLICATE_MESSAGE_IGNORED"] };
    await this.store.enqueue(message);
    return { duplicate: false, message, warnings: [] };
  }

  async processMessage(message: IncomingWhatsAppMessage): Promise<ProcessingOutcome> {
    const conversation = await this.store.conversation(message.organizationId, message.senderPhone, this.configuration.limits.maxContextMessages);
    const month = message.receivedAt.slice(0, 7); const usage = await this.store.usage(message.organizationId, month);
    const interpretation = await this.interpreter.interpret({ organizationId: message.organizationId, senderPhone: message.senderPhone, messages: conversation }, usage);
    const synchronized = await synchronizeInterpretationWithCrm(message, interpretation.interpretation, this.crm); const event = synchronized.event;
    await this.store.complete(message.metaMessageId, interpretation, event);
    return { duplicate: false, message, interpretation, event, crmOperations: synchronized.operations, warnings: event.warnings };
  }

  async workOne(): Promise<{ processed: boolean; outcome?: ProcessingOutcome; failureCode?: string }> {
    const job = await this.store.claim(this.now().toISOString()); if (!job) return { processed: false };
    const message = await this.store.message(job.messageId); if (!message) { await this.store.fail(job.messageId, job.attempts, "WHATSAPP_MESSAGE_NOT_FOUND"); return { processed: true, failureCode: "WHATSAPP_MESSAGE_NOT_FOUND" }; }
    try { return { processed: true, outcome: await this.processMessage(message) }; }
    catch (error) {
      const code = safeFailureCode(error); const retryable = /(?:RATE_LIMITED|UNAVAILABLE|TIMEOUT|PROCESSING_FAILED)/.test(code);
      if (retryable && job.attempts < this.configuration.maxAttempts) {
        const delay = this.configuration.retryBaseMs * 2 ** (job.attempts - 1); await this.store.retry(job.messageId, job.attempts, new Date(this.now().getTime() + delay).toISOString(), code);
      } else await this.store.fail(job.messageId, job.attempts, code);
      return { processed: true, failureCode: code };
    }
  }
}
