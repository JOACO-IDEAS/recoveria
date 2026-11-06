import type { CrmCandidateEvent, IncomingWhatsAppMessage, InterpretationResult, TokenUsage } from "./types";

export type ProcessingJobStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "RETRY" | "FAILED";
export interface ProcessingJob { readonly messageId: string; readonly organizationId: string; readonly status: ProcessingJobStatus; readonly attempts: number; readonly nextAttemptAt: string; readonly failureCode?: string }
export interface UsageSnapshot { readonly inputTokens: number; readonly outputTokens: number; readonly totalTokens: number; readonly estimatedCostUsdMicros: number }

export interface WhatsAppIntelligenceStore {
  accept(message: IncomingWhatsAppMessage): Promise<{ inserted: boolean; message: IncomingWhatsAppMessage }>;
  conversation(organizationId: string, senderPhone: string, limit: number): Promise<readonly IncomingWhatsAppMessage[]>;
  message(messageId: string): Promise<IncomingWhatsAppMessage | null>;
  enqueue(message: IncomingWhatsAppMessage): Promise<void>;
  claim(now: string): Promise<ProcessingJob | null>;
  complete(messageId: string, interpretation: InterpretationResult, event: CrmCandidateEvent): Promise<void>;
  retry(messageId: string, attempts: number, nextAttemptAt: string, failureCode: string): Promise<void>;
  fail(messageId: string, attempts: number, failureCode: string): Promise<void>;
  usage(organizationId: string, month: string): Promise<UsageSnapshot>;
  eventForMessage(messageId: string): Promise<CrmCandidateEvent | null>;
}

const emptyUsage = (): UsageSnapshot => ({ inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsdMicros: 0 });

export class InMemoryWhatsAppIntelligenceStore implements WhatsAppIntelligenceStore {
  private readonly messages = new Map<string, IncomingWhatsAppMessage>();
  private readonly jobs = new Map<string, ProcessingJob>();
  private readonly interpretations = new Map<string, InterpretationResult>();
  private readonly events = new Map<string, CrmCandidateEvent>();
  private readonly usageByMonth = new Map<string, UsageSnapshot>();
  private key(message: IncomingWhatsAppMessage) { return `${message.organizationId}\0${message.metaMessageId}`; }
  async accept(message: IncomingWhatsAppMessage) {
    const key = this.key(message); const current = this.messages.get(key);
    if (current) return { inserted: false, message: current };
    this.messages.set(key, structuredClone(message)); return { inserted: true, message: structuredClone(message) };
  }
  async conversation(organizationId: string, senderPhone: string, limit: number) {
    return [...this.messages.values()].filter(item => item.organizationId === organizationId && item.senderPhone === senderPhone)
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)).slice(-limit).map(item => structuredClone(item));
  }
  async message(messageId: string) { const value = [...this.messages.values()].find(item => item.metaMessageId === messageId); return value ? structuredClone(value) : null; }
  async enqueue(message: IncomingWhatsAppMessage) {
    if (!this.jobs.has(message.metaMessageId)) this.jobs.set(message.metaMessageId, { messageId: message.metaMessageId, organizationId: message.organizationId, status: "PENDING", attempts: 0, nextAttemptAt: new Date(0).toISOString() });
  }
  async claim(now: string) {
    const job = [...this.jobs.values()].filter(item => (item.status === "PENDING" || item.status === "RETRY") && item.nextAttemptAt <= now)
      .sort((a, b) => a.nextAttemptAt.localeCompare(b.nextAttemptAt))[0];
    if (!job) return null;
    const claimed = { ...job, status: "RUNNING" as const, attempts: job.attempts + 1 }; this.jobs.set(job.messageId, claimed); return claimed;
  }
  async complete(messageId: string, interpretation: InterpretationResult, event: CrmCandidateEvent) {
    this.interpretations.set(messageId, structuredClone(interpretation)); this.events.set(messageId, structuredClone(event));
    const job = this.jobs.get(messageId); if (job) this.jobs.set(messageId, { ...job, status: "SUCCEEDED", failureCode: undefined });
    const month = eventMonth(event, this.messages); const key = `${event.organizationId}\0${month}`; const current = this.usageByMonth.get(key) ?? emptyUsage();
    this.usageByMonth.set(key, addUsage(current, interpretation.usage));
  }
  async retry(messageId: string, attempts: number, nextAttemptAt: string, failureCode: string) { const job = this.jobs.get(messageId); if (job) this.jobs.set(messageId, { ...job, status: "RETRY", attempts, nextAttemptAt, failureCode }); }
  async fail(messageId: string, attempts: number, failureCode: string) { const job = this.jobs.get(messageId); if (job) this.jobs.set(messageId, { ...job, status: "FAILED", attempts, failureCode }); }
  async usage(organizationId: string, month: string) { return structuredClone(this.usageByMonth.get(`${organizationId}\0${month}`) ?? emptyUsage()); }
  async eventForMessage(messageId: string) { const value = this.events.get(messageId); return value ? structuredClone(value) : null; }
}

function addUsage(a: UsageSnapshot, b: TokenUsage): UsageSnapshot { return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, totalTokens: a.totalTokens + b.totalTokens, estimatedCostUsdMicros: a.estimatedCostUsdMicros + b.estimatedCostUsdMicros }; }
function eventMonth(event: CrmCandidateEvent, messages: Map<string, IncomingWhatsAppMessage>) { const message = [...messages.values()].find(item => item.metaMessageId === event.sourceMessageId); return (message?.receivedAt ?? new Date().toISOString()).slice(0, 7); }
