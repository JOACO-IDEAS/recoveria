import { deepFreeze } from "@/lib/domain/evidence";
import type { CommunicationAuthorizedFacts, CommunicationIntent, CommunicationPreparationEvaluation, CommunicationPreparationInput, ExcludedInvoiceFact } from "./types";

const unique = (values: readonly string[]) => [...new Set(values)].sort();
const hash = (value: string) => { let result = 2166136261; for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619); return (result >>> 0).toString(16).padStart(8, "0"); };
const snapshotOf = (input: CommunicationPreparationInput) => hash(JSON.stringify({ organizationId: input.organizationId, caseId: input.caseId, projection: input.projection, contacts: input.interactionContext.relevantContacts, selectedContactId: input.selectedContactId, selectedChannelId: input.selectedChannelId, promises: input.interactionContext.activePromises.concat(input.interactionContext.brokenPromises), claims: input.interactionContext.pendingPaymentClaims, disputes: input.interactionContext.openDisputes, invoices: input.invoices, allowPaymentVerificationRequest: input.allowPaymentVerificationRequest }));

function intentFor(input: CommunicationPreparationInput): CommunicationIntent | undefined {
  const action = input.projection.recommendation.action;
  if (action === "CONTACT") return "INITIAL_COLLECTION_CONTACT";
  if (action === "FOLLOW_UP") return input.interactionContext.brokenPromises.length ? "PROMISE_FOLLOW_UP" : "FOLLOW_UP";
  if (action === "REQUEST_INFORMATION") return "INFORMATION_REQUEST";
  if (action === "VERIFY_PAYMENT" && input.allowPaymentVerificationRequest) return "PAYMENT_VERIFICATION_REQUEST";
  return undefined;
}

export function evaluateCommunicationPreparation(input: CommunicationPreparationInput): CommunicationPreparationEvaluation {
  if (input.organizationId !== input.projection.organizationId || input.organizationId !== input.interactionContext.organizationId || input.caseId !== input.projection.caseId || input.caseId !== input.interactionContext.caseId) throw new Error("Cross-tenant or cross-case communication preparation rejected");
  if (input.administrationId !== input.interactionContext.relevantContacts.administrationId || input.buildingId !== input.interactionContext.relevantContacts.buildingId) throw new Error("Communication preparation administration or building mismatch");
  if (!input.administrationEvidenceRefs.length || !input.buildingEvidenceRefs.length) throw new Error("Communication identity facts require evidence");
  const candidates = [...input.interactionContext.relevantContacts.readyContacts, ...input.interactionContext.relevantContacts.reviewRequiredContacts, ...input.interactionContext.relevantContacts.ineligibleContacts];
  if (candidates.some(candidate => candidate.contact.organizationId !== input.organizationId || candidate.channels.some(channel => channel.organizationId !== input.organizationId))) throw new Error("Cross-tenant communication contact data rejected");
  if (new Set(input.invoices.map(invoice => invoice.id)).size !== input.invoices.length) throw new Error("Duplicate communication invoice facts rejected");
  if (input.invoices.some(invoice => invoice.organizationId !== input.organizationId || !Number.isSafeInteger(invoice.outstandingCents) || invoice.outstandingCents < 0 || !Number.isSafeInteger(invoice.overdueCents) || invoice.overdueCents < 0 || !invoice.evidenceRefs.length)) throw new Error("Invalid authoritative communication invoice facts");
  const snapshotFingerprint = snapshotOf(input);
  const blockers: string[] = [];
  const selectionRequirements: ("CONTACT_SELECTION_REQUIRED" | "CHANNEL_SELECTION_REQUIRED")[] = [];
  const intent = intentFor(input);
  if (!intent) blockers.push("ACTION_NOT_DRAFTABLE");
  if (input.projection.conditions.some(item => item.condition === "ENTITY_UNCERTAIN")) blockers.push("ENTITY_UNCERTAIN");
  if (input.projection.conditions.some(item => item.condition === "LEGAL_REVIEW_THRESHOLD") || input.projection.recommendation.action === "PREPARE_LEGAL_REVIEW") blockers.push("LEGAL_REVIEW");
  if (input.projection.outstandingCents === 0) blockers.push("ZERO_BALANCE");
  if (input.projection.recommendation.action === "WAIT" || input.interactionContext.activePromises.length) blockers.push("ACTIVE_PROMISE_WAIT");

  const readyContacts = input.interactionContext.relevantContacts.readyContacts;
  const selectedContact = input.selectedContactId ? readyContacts.find(item => item.contact.id === input.selectedContactId) : readyContacts.length === 1 ? readyContacts[0] : undefined;
  if (input.selectedContactId && !selectedContact) blockers.push("SELECTED_CONTACT_NOT_ELIGIBLE");
  else if (!readyContacts.length && input.interactionContext.relevantContacts.reviewRequiredContacts.length) blockers.push("CONTACT_REVIEW_REQUIRED");
  else if (!readyContacts.length) blockers.push("NO_ELIGIBLE_CONTACT");
  else if (!selectedContact) selectionRequirements.push("CONTACT_SELECTION_REQUIRED");

  const draftableChannels = selectedContact?.eligibleChannels.filter(channel => channel.type === "EMAIL" || channel.type === "WHATSAPP") ?? [];
  const selectedChannel = input.selectedChannelId ? draftableChannels.find(channel => channel.id === input.selectedChannelId) : draftableChannels.length === 1 ? draftableChannels[0] : undefined;
  if (input.selectedChannelId && !selectedChannel) blockers.push("SELECTED_CHANNEL_NOT_ELIGIBLE");
  else if (selectedContact && !draftableChannels.length) blockers.push("NO_DRAFTABLE_CHANNEL");
  else if (selectedContact && !selectedChannel) selectionRequirements.push("CHANNEL_SELECTION_REQUIRED");

  const pendingClaimInvoiceIds = new Set(input.interactionContext.pendingPaymentClaims.flatMap(claim => claim.invoiceIds));
  const disputedInvoiceIds = new Set(input.interactionContext.openDisputes.map(dispute => dispute.invoiceId));
  const activePromiseInvoiceIds = new Set(input.interactionContext.activePromises.flatMap(promise => promise.invoiceIds));
  let targetInvoiceIds = intent === "PAYMENT_VERIFICATION_REQUEST" ? unique([...pendingClaimInvoiceIds]) : [...input.projection.collectibleInvoiceIds];
  if (intent !== "PAYMENT_VERIFICATION_REQUEST") targetInvoiceIds = targetInvoiceIds.filter(id => !pendingClaimInvoiceIds.has(id) && !disputedInvoiceIds.has(id) && !activePromiseInvoiceIds.has(id));
  if (targetInvoiceIds.some(id => disputedInvoiceIds.has(id))) blockers.push("TARGET_INVOICE_DISPUTED");
  if (intent !== "PAYMENT_VERIFICATION_REQUEST" && targetInvoiceIds.some(id => pendingClaimInvoiceIds.has(id))) blockers.push("TARGET_PAYMENT_CLAIM_PENDING");
  if (!targetInvoiceIds.length && intent) blockers.push("NO_ELIGIBLE_TARGET_INVOICE");
  const invoiceById = new Map(input.invoices.map(invoice => [invoice.id, invoice]));
  if (targetInvoiceIds.some(id => !invoiceById.has(id))) throw new Error("Communication target lacks authoritative invoice facts");
  if (!input.projection.recommendation.evidenceRefs.length) blockers.push("MISSING_ACTION_EVIDENCE");

  const hardBlocked = blockers.some(blocker => !["CONTACT_REVIEW_REQUIRED"].includes(blocker));
  let outcome: CommunicationPreparationEvaluation["outcome"] = hardBlocked ? "BLOCKED" : blockers.length || selectionRequirements.length ? "REVIEW_REQUIRED" : "READY_FOR_DRAFT";
  let authorizedFacts: CommunicationAuthorizedFacts | undefined;
  if (outcome === "READY_FOR_DRAFT" && intent && selectedContact && selectedChannel) {
    const invoiceFacts = targetInvoiceIds.map(id => invoiceById.get(id)!);
    const excludedInvoices: ExcludedInvoiceFact[] = input.invoices.filter(invoice => !targetInvoiceIds.includes(invoice.id)).map(invoice => ({ invoiceId: invoice.id, reasons: unique([...(disputedInvoiceIds.has(invoice.id) ? ["OPEN_DISPUTE"] : []), ...(pendingClaimInvoiceIds.has(invoice.id) ? ["PAYMENT_CLAIM_PENDING"] : []), ...(activePromiseInvoiceIds.has(invoice.id) ? ["ACTIVE_PROMISE"] : []), ...(!input.projection.collectibleInvoiceIds.includes(invoice.id) ? ["NOT_COLLECTIBLE"] : [])]) }));
    const relevantPromise = intent === "PROMISE_FOLLOW_UP" ? input.interactionContext.brokenPromises.find(promise => promise.invoiceIds.some(id => targetInvoiceIds.includes(id)) && !promise.invoiceIds.some(id => disputedInvoiceIds.has(id)) && !promise.fulfillmentBlockers.length) : undefined;
    if (intent === "PROMISE_FOLLOW_UP" && !relevantPromise) { blockers.push("BROKEN_PROMISE_NOT_SAFE_TO_STATE"); outcome = "BLOCKED"; }
    else {
      const relevantPaymentClaim = intent === "PAYMENT_VERIFICATION_REQUEST" ? input.interactionContext.pendingPaymentClaims.find(claim => claim.invoiceIds.some(id => targetInvoiceIds.includes(id))) : undefined;
      const facts = [
        { id: "fact:administration", category: "FACT" as const, kind: "ADMINISTRATION_NAME", value: input.administrationName, evidenceRefs: [...input.administrationEvidenceRefs] },
        { id: "fact:building", category: "FACT" as const, kind: "BUILDING_NAME", value: input.buildingDisplayName, evidenceRefs: [...input.buildingEvidenceRefs] },
        { id: "fact:contact", category: "FACT" as const, kind: "CONTACT_NAME", value: selectedContact.contact.displayName, evidenceRefs: [...selectedContact.contact.evidenceRefs] },
        { id: "fact:recommendation", category: "RECOMMENDATION" as const, kind: "NEXT_ACTION", value: input.projection.recommendation.action, evidenceRefs: [...input.projection.recommendation.evidenceRefs] },
        ...invoiceFacts.flatMap(invoice => [{ id: `fact:invoice:${invoice.id}`, category: "FACT" as const, kind: "INVOICE_NUMBER", value: invoice.invoiceNumber, evidenceRefs: [...invoice.evidenceRefs] }, { id: `fact:amount:${invoice.id}`, category: "FACT" as const, kind: "OUTSTANDING_CENTS", value: invoice.outstandingCents, evidenceRefs: [...invoice.evidenceRefs] }]),
        ...(relevantPromise ? [{ id: `fact:promise:${relevantPromise.id}`, category: "HUMAN_DECISION" as const, kind: "BROKEN_PROMISE_DATE", value: relevantPromise.promisedDate, evidenceRefs: [...relevantPromise.evidenceRefs, ...relevantPromise.fulfillmentEvidenceRefs] }] : []),
        ...(relevantPaymentClaim ? [{ id: `fact:claim:${relevantPaymentClaim.id}`, category: "HUMAN_DECISION" as const, kind: "PENDING_PAYMENT_CLAIM", value: true, evidenceRefs: [...relevantPaymentClaim.evidenceRefs] }] : []),
      ];
      const chronologySummaryFacts = input.interactionContext.chronology
        .filter(item => item.relatedInvoiceIds.length > 0 && item.relatedInvoiceIds.some(id => targetInvoiceIds.includes(id)))
        .slice(0, 3)
        .map(item => ({ id: `fact:chronology:${item.id}`, category: "FACT" as const, kind: item.kind, value: item.occurredAt, evidenceRefs: [...item.evidenceRefs] }));
      authorizedFacts = deepFreeze({ organizationId: input.organizationId, caseId: input.caseId, administrationName: input.administrationName, buildingDisplayName: input.buildingDisplayName, contactName: selectedContact.contact.displayName, contactRole: selectedContact.role, channel: { id: selectedChannel.id, type: selectedChannel.type, rawValue: selectedChannel.rawValue, normalizedValue: selectedChannel.normalizedValue }, action: input.projection.recommendation.action, intent, invoiceFacts, includedInvoiceIds: targetInvoiceIds, excludedInvoices, targetOutstandingCents: invoiceFacts.reduce((sum, invoice) => sum + invoice.outstandingCents, 0), targetOverdueCents: invoiceFacts.reduce((sum, invoice) => sum + invoice.overdueCents, 0), relevantPromise: relevantPromise ? { id: relevantPromise.id, promisedDate: relevantPromise.promisedDate, amountCents: relevantPromise.amountCents, evidenceRefs: relevantPromise.evidenceRefs } : undefined, relevantPaymentClaim: relevantPaymentClaim ? { id: relevantPaymentClaim.id, invoiceIds: relevantPaymentClaim.invoiceIds, evidenceRefs: relevantPaymentClaim.evidenceRefs } : undefined, chronologySummaryFacts, facts, evidenceRefs: unique([...facts.flatMap(fact => fact.evidenceRefs), ...chronologySummaryFacts.flatMap(fact => fact.evidenceRefs)]) });
    }
  }
  return deepFreeze({ outcome, intent, blockers: unique(blockers), selectionRequirements, selectedContact, selectedChannel, authorizedFacts, snapshotFingerprint });
}

export function communicationSnapshotFingerprint(input: CommunicationPreparationInput): string { return snapshotOf(input); }
