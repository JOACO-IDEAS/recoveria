import { deriveCollectionInteractionContext, projectCollectionCaseWithInteractionContext } from "@/modules/collection-interactions";
import { resolveCollectionContacts } from "@/modules/contact-relationships";
import type { CommunicationInvoiceFact, CommunicationPreparationInput } from "@/modules/communication-preparation";
import { projectCollectionCase } from "@/modules/collections-engine";
import { channelOf, contactContextOf, contactOf, relationshipOf } from "./phase-5b2a-contact-truth-set";
import { claimOf, disputeOf, interactionCaseOf, interactionInput, promiseOf } from "./phase-5b2b-interaction-truth-set";
import { eventOf, invoiceOf } from "./phase-5b1-truth-set";

export const communicationCase = interactionCaseOf();
export const communicationInvoice = (id = "invoice-a", overrides: Partial<CommunicationInvoiceFact> = {}): CommunicationInvoiceFact => ({ id, organizationId: communicationCase.organizationId, invoiceNumber: id === "invoice-a" ? "FAC-001" : `FAC-${id.toUpperCase()}`, outstandingCents: 800_000_00, overdueCents: 800_000_00, dueDate: "2026-08-01", evidenceRefs: [`ledger:${id}`], ...overrides });

export function communicationInput(overrides: Partial<CommunicationPreparationInput> = {}): CommunicationPreparationInput {
  const juan = contactOf("juan", { displayName: "Juan García" });
  const contactResolution = resolveCollectionContacts(communicationCase, contactContextOf({ contacts: [juan], channels: [channelOf(juan.id, "email-juan", { type: "EMAIL", rawValue: "juan@example.invalid", normalizedValue: "juan@example.invalid" })], relationships: [relationshipOf(juan.id, "relationship-juan")] }));
  const context = deriveCollectionInteractionContext(interactionInput({ case: communicationCase, contactResolution }));
  const projection = projectCollectionCase({ organizationId: communicationCase.organizationId, asOf: context.asOf, case: communicationCase, invoices: [invoiceOf("invoice-a", { outstandingCents: 800_000_00 })], events: [eventOf(communicationCase.id, "opened-communication", "CASE_OPENED")], contactAvailable: true, entityConfidence: "CONFIRMED", legalReviewThreshold: false, evidenceRefs: ["recommendation:contact"] });
  return { organizationId: communicationCase.organizationId, caseId: communicationCase.id, administrationId: communicationCase.administrationId!, administrationName: "Administración Sintética", administrationEvidenceRefs: ["party:adm-a"], buildingId: communicationCase.buildingId, buildingDisplayName: "Consorcio Sintético", buildingEvidenceRefs: ["building:a"], projection, interactionContext: context, invoices: [communicationInvoice()], allowPaymentVerificationRequest: true, ...overrides };
}

export function inputWithInteraction(options: { claim?: boolean; dispute?: boolean; promise?: "ACTIVE" | "BROKEN"; zero?: boolean; legal?: boolean } = {}): CommunicationPreparationInput {
  const claim = options.claim ? claimOf("claim-communication", { claimedAmountCents: 800_000_00 }) : undefined;
  const promise = options.promise ? promiseOf("promise-communication", { promisedDate: options.promise === "ACTIVE" ? "2026-09-20" : "2026-09-09" }) : undefined;
  const base = communicationInput();
  const context = deriveCollectionInteractionContext(interactionInput({ case: communicationCase, contactResolution: base.interactionContext.relevantContacts, promises: promise ? [promise] : [], paymentClaims: claim ? [claim] : [], disputes: options.dispute ? [disputeOf("dispute-communication")] : [] }));
  const balance = options.zero ? 0 : 800_000_00;
  const projection = projectCollectionCaseWithInteractionContext({ projectionInput: { organizationId: communicationCase.organizationId, case: communicationCase, invoices: [invoiceOf("invoice-a", { outstandingCents: balance })], contactAvailable: true, entityConfidence: "CONFIRMED", legalReviewThreshold: options.legal ?? false, evidenceRefs: ["recommendation:context"] }, interactionContext: context, collectionEvents: [] });
  return communicationInput({ projection, interactionContext: context, invoices: [communicationInvoice("invoice-a", { outstandingCents: balance, overdueCents: balance })] });
}
