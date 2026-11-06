import type {
  ConversationEventInput, CrmDebtor, CrmInvoice, CrmOperationResult, CrmOutstandingBalance, CrmRequestContext,
  DebtorLookup, FollowUpInput, InvoiceLookup, PaymentPromiseInput, PaymentReportedInput, RecoveriaCrmAdapter, ReviewFlagInput,
} from "./crm-adapter";

export type RecoveriaCrmOperation =
  | "debtor.find"
  | "invoice.find"
  | "invoice.outstanding-balance.get"
  | "conversation-event.create"
  | "payment-reported.create"
  | "payment-promise.create"
  | "follow-up.schedule"
  | "review.flag";

export interface RecoveriaCrmApiRequest<TPayload = unknown> {
  readonly contractVersion: CrmRequestContext["contractVersion"];
  readonly organizationId: string;
  readonly requestId: string;
  readonly idempotencyKey: string;
  readonly source: "WHATSAPP";
  readonly operation: RecoveriaCrmOperation;
  readonly payload: TPayload;
}
export interface RecoveriaCrmApiResponse<TResult = unknown> {
  readonly contractVersion: CrmRequestContext["contractVersion"];
  readonly requestId: string;
  readonly ok: boolean;
  readonly result?: TResult;
  readonly error?: { readonly code: string; readonly retryable: boolean };
}

/** Host-specific code supplies the authenticated transport and its endpoint. */
export interface RecoveriaCrmTransport {
  execute<TResult>(request: RecoveriaCrmApiRequest): Promise<RecoveriaCrmApiResponse<TResult>>;
}

export class TransportRecoveriaCrmAdapter implements RecoveriaCrmAdapter {
  constructor(private readonly transport: RecoveriaCrmTransport) {}

  findDebtor(context: CrmRequestContext, payload: DebtorLookup) { return this.call<readonly CrmDebtor[]>(context, "debtor.find", payload); }
  findInvoice(context: CrmRequestContext, payload: InvoiceLookup) { return this.call<readonly CrmInvoice[]>(context, "invoice.find", payload); }
  getOutstandingBalance(context: CrmRequestContext, invoiceId: string) { return this.call<CrmOutstandingBalance | null>(context, "invoice.outstanding-balance.get", { invoiceId }); }
  createConversationEvent(context: CrmRequestContext, payload: ConversationEventInput) { return this.call<CrmOperationResult>(context, "conversation-event.create", payload); }
  createPaymentReportedEvent(context: CrmRequestContext, payload: PaymentReportedInput) { return this.call<CrmOperationResult>(context, "payment-reported.create", payload); }
  createPaymentPromise(context: CrmRequestContext, payload: PaymentPromiseInput) { return this.call<CrmOperationResult>(context, "payment-promise.create", payload); }
  scheduleFollowUp(context: CrmRequestContext, payload: FollowUpInput) { return this.call<CrmOperationResult>(context, "follow-up.schedule", payload); }
  flagForReview(context: CrmRequestContext, payload: ReviewFlagInput) { return this.call<CrmOperationResult>(context, "review.flag", payload); }

  private async call<TResult>(context: CrmRequestContext, operation: RecoveriaCrmOperation, payload: unknown): Promise<TResult> {
    const response = await this.transport.execute<TResult>({ ...context, operation, payload });
    if (response.contractVersion !== context.contractVersion || response.requestId !== context.requestId) throw new Error("RECOVERIA_CRM_RESPONSE_MISMATCH");
    if (!response.ok || response.result === undefined) throw new Error(response.error?.retryable ? "RECOVERIA_CRM_TEMPORARILY_UNAVAILABLE" : response.error?.code ?? "RECOVERIA_CRM_REQUEST_REJECTED");
    return response.result;
  }
}
