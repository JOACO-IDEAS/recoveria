import type { CollectionInteractionContext } from "@/modules/collection-interactions";
import type { ContactChannel, ContactEligibilityCandidate } from "@/modules/contact-relationships";
import type { CaseProjection, NextAction } from "@/modules/collections-engine";

export type CommunicationPreparationOutcome = "READY_FOR_DRAFT" | "REVIEW_REQUIRED" | "BLOCKED";
export type CommunicationIntent = "INITIAL_COLLECTION_CONTACT" | "FOLLOW_UP" | "PROMISE_FOLLOW_UP" | "PAYMENT_VERIFICATION_REQUEST" | "INFORMATION_REQUEST";
export type FactTrustCategory = "FACT" | "INTERPRETATION" | "UNCERTAINTY" | "BLOCKER" | "RECOMMENDATION" | "HUMAN_DECISION";
export type CommunicationTonePolicy = "PROFESSIONAL_NEUTRAL";

export interface CommunicationInvoiceFact {
  readonly id: string;
  readonly organizationId: string;
  readonly invoiceNumber: string;
  readonly outstandingCents: number;
  readonly overdueCents: number;
  readonly dueDate?: string;
  readonly evidenceRefs: readonly string[];
}

export interface AuthorizedFact {
  readonly id: string;
  readonly category: FactTrustCategory;
  readonly kind: string;
  readonly value: string | number | boolean;
  readonly evidenceRefs: readonly string[];
}

export interface ExcludedInvoiceFact { readonly invoiceId: string; readonly reasons: readonly string[] }

export interface CommunicationAuthorizedFacts {
  readonly organizationId: string;
  readonly caseId: string;
  readonly administrationName: string;
  readonly buildingDisplayName: string;
  readonly contactName: string;
  readonly contactRole: ContactEligibilityCandidate["role"];
  readonly channel: Pick<ContactChannel, "id" | "type" | "normalizedValue" | "rawValue">;
  readonly action: NextAction;
  readonly intent: CommunicationIntent;
  readonly invoiceFacts: readonly CommunicationInvoiceFact[];
  readonly includedInvoiceIds: readonly string[];
  readonly excludedInvoices: readonly ExcludedInvoiceFact[];
  readonly targetOutstandingCents: number;
  readonly targetOverdueCents: number;
  readonly relevantPromise?: { readonly id: string; readonly promisedDate: string; readonly amountCents: number; readonly evidenceRefs: readonly string[] };
  readonly relevantPaymentClaim?: { readonly id: string; readonly invoiceIds: readonly string[]; readonly evidenceRefs: readonly string[] };
  readonly chronologySummaryFacts: readonly AuthorizedFact[];
  readonly facts: readonly AuthorizedFact[];
  readonly evidenceRefs: readonly string[];
}

export interface CommunicationPreparationInput {
  readonly organizationId: string;
  readonly caseId: string;
  readonly administrationId: string;
  readonly administrationName: string;
  readonly administrationEvidenceRefs: readonly string[];
  readonly buildingId: string;
  readonly buildingDisplayName: string;
  readonly buildingEvidenceRefs: readonly string[];
  readonly projection: CaseProjection;
  readonly interactionContext: CollectionInteractionContext;
  readonly invoices: readonly CommunicationInvoiceFact[];
  readonly selectedContactId?: string;
  readonly selectedChannelId?: string;
  readonly allowPaymentVerificationRequest: boolean;
}

export interface CommunicationPreparationEvaluation {
  readonly outcome: CommunicationPreparationOutcome;
  readonly intent?: CommunicationIntent;
  readonly blockers: readonly string[];
  readonly selectionRequirements: readonly ("CONTACT_SELECTION_REQUIRED" | "CHANNEL_SELECTION_REQUIRED")[];
  readonly selectedContact?: ContactEligibilityCandidate;
  readonly selectedChannel?: ContactChannel;
  readonly authorizedFacts?: CommunicationAuthorizedFacts;
  readonly snapshotFingerprint: string;
}

export interface CommunicationDraftRequest {
  readonly id: string;
  readonly organizationId: string;
  readonly caseId: string;
  readonly contactId: string;
  readonly channelId: string;
  readonly intent: CommunicationIntent;
  readonly authorizedFacts: CommunicationAuthorizedFacts;
  readonly tonePolicy: CommunicationTonePolicy;
  readonly language: "es-AR";
  readonly evidenceRefs: readonly string[];
  readonly requestedAt: string;
  readonly requestedBy: string;
  readonly snapshotFingerprint: string;
}

export interface CommunicationDraft {
  readonly id: string;
  readonly requestId: string;
  readonly organizationId: string;
  readonly caseId: string;
  readonly contactId: string;
  readonly channelId: string;
  readonly intent: CommunicationIntent;
  readonly subject?: string;
  readonly body: string;
  readonly channel: "EMAIL" | "WHATSAPP";
  readonly createdAt: string;
  readonly draftingMethod: "DETERMINISTIC_TEMPLATE" | "EXTERNAL_PROVIDER";
  readonly factRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly warnings: readonly string[];
  readonly requiresHumanApproval: true;
  readonly snapshotFingerprint: string;
}

export interface CommunicationDraftProvider { readonly id: string; draft(request: CommunicationDraftRequest): CommunicationDraft }
export interface DraftValidationResult { readonly valid: boolean; readonly errors: readonly string[] }
export interface DraftApproval { readonly id: string; readonly organizationId: string; readonly draftId: string; readonly status: "APPROVED" | "REJECTED"; readonly actorId: string; readonly decidedAt: string; readonly reason?: string }
