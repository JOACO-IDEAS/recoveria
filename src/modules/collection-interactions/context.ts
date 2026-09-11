import { deepFreeze } from "@/lib/domain/evidence";
import { effectiveCollectionEvents, projectCollectionCase } from "@/modules/collections-engine";
import type { CaseProjection, CollectionEvent } from "@/modules/collections-engine";
import type { CollectionChronologyEntry, CollectionInteraction, CollectionInteractionContext, CollectionInteractionContextInput, DerivedDispute, DerivedPaymentClaim, DerivedPromise, InteractionProjectionBridgeInput } from "./types";

const unique = (values: readonly string[]) => [...new Set(values)].sort();
const latest = (items: readonly CollectionInteraction[], type: CollectionInteraction["type"]) => [...items].filter(item => item.type === type).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id))[0];
const cloneInteraction = (item: CollectionInteraction | undefined) => item ? { ...item, actor: { ...item.actor }, relatedInvoiceIds: [...item.relatedInvoiceIds], evidenceRefs: [...item.evidenceRefs] } : undefined;
const supersededIds = <T extends { readonly id: string }>(items: readonly T[], key: (item: T) => string | undefined) => new Set(items.map(key).filter((id): id is string => Boolean(id)));
const sameInvoices = (left: readonly string[], right: readonly string[]) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

function validate(input: CollectionInteractionContextInput): void {
  const { organizationId, case: collectionCase } = input;
  if (collectionCase.organizationId !== organizationId || input.contactResolution.organizationId !== organizationId || input.contactResolution.caseId !== collectionCase.id) throw new Error("Cross-tenant or cross-case interaction context rejected");
  if (!collectionCase.administrationId || input.contactResolution.administrationId !== collectionCase.administrationId || input.contactResolution.buildingId !== collectionCase.buildingId) throw new Error("Interaction context administration or building does not match the case");
  const facts = [...input.collectionEvents, ...input.interactions, ...input.promises, ...input.confirmedPromisePayments, ...input.paymentClaims, ...input.disputes];
  if (facts.some(fact => fact.organizationId !== organizationId || fact.caseId !== collectionCase.id)) throw new Error("Cross-tenant or cross-case interaction fact rejected");
  const invoiceIds = new Set(collectionCase.invoiceIds);
  const contactIds = new Set([...input.contactResolution.readyContacts, ...input.contactResolution.reviewRequiredContacts, ...input.contactResolution.ineligibleContacts].map(item => item.contact.id));
  const channelIds = new Set([...input.contactResolution.readyContacts, ...input.contactResolution.reviewRequiredContacts, ...input.contactResolution.ineligibleContacts].flatMap(item => item.channels.map(channel => channel.id)));
  const canonical = [...input.promises, ...input.paymentClaims, ...input.disputes];
  if (canonical.some(fact => !fact.confirmedBy || !fact.evidenceRefs.length)) throw new Error("Canonical promise, claim, and dispute facts require human confirmation and evidence");
  if (canonical.some(fact => fact.administrationId !== collectionCase.administrationId)) throw new Error("Canonical interaction fact administration does not match the case");
  for (const records of [input.collectionEvents, input.interactions, input.promises, input.confirmedPromisePayments, input.paymentClaims, input.disputes]) if (new Set(records.map(item => item.id)).size !== records.length) throw new Error("Duplicate interaction-domain identity rejected");
  for (const interaction of input.interactions) {
    if (interaction.administrationId !== collectionCase.administrationId || !interaction.evidenceRefs.length || (interaction.contactId && !contactIds.has(interaction.contactId)) || (interaction.channelId && !channelIds.has(interaction.channelId)) || interaction.relatedInvoiceIds.some(id => !invoiceIds.has(id))) throw new Error("Invalid interaction reference or evidence rejected");
  }
  if (canonical.some(fact => fact.contactId && !contactIds.has(fact.contactId))) throw new Error("Canonical interaction fact references an unknown contact");
  for (const promise of input.promises) if (!Number.isSafeInteger(promise.amountCents) || promise.amountCents <= 0 || !promise.promisedDate || !promise.invoiceIds.length || promise.invoiceIds.some(id => !invoiceIds.has(id))) throw new Error("Invalid canonical promise rejected");
  for (const claim of input.paymentClaims) if (!claim.invoiceIds.length || claim.invoiceIds.some(id => !invoiceIds.has(id)) || (claim.claimedAmountCents !== undefined && (!Number.isSafeInteger(claim.claimedAmountCents) || claim.claimedAmountCents <= 0))) throw new Error("Invalid payment claim rejected");
  for (const dispute of input.disputes) if (!invoiceIds.has(dispute.invoiceId)) throw new Error("Invalid invoice dispute rejected");
  for (const payment of input.confirmedPromisePayments) if (!input.promises.some(promise => promise.id === payment.promiseId) || !Number.isSafeInteger(payment.amountCents) || payment.amountCents <= 0 || !payment.financialEvidenceRefs.length || (payment.paymentClaimId && !input.paymentClaims.some(claim => claim.id === payment.paymentClaimId))) throw new Error("Invalid confirmed financial promise evidence rejected");
  for (const event of effectiveCollectionEvents(input.collectionEvents).filter(item => item.type === "PAYMENT_VERIFIED")) {
    const claim = input.paymentClaims.find(item => item.id === String(event.data?.claimEventId ?? ""));
    if (!claim || !event.evidenceRefs.length || event.actor.kind !== "HUMAN" || !event.relatedDecisionId || (event.relatedInvoiceId && !claim.invoiceIds.includes(event.relatedInvoiceId))) throw new Error("Payment verification must use the sanctioned claim-linked event path");
  }
  const validateSupersession = <T extends { readonly id: string; readonly organizationId: string; readonly caseId: string }>(items: readonly T[], key: (item: T) => string | undefined, compatible: (prior: T, next: T) => boolean) => {
    for (const item of items) {
      const priorId = key(item);
      if (!priorId) continue;
      const prior = items.find(candidate => candidate.id === priorId);
      if (!prior || prior.organizationId !== item.organizationId || prior.caseId !== item.caseId || !compatible(prior, item)) throw new Error("Invalid typed-fact supersession rejected");
      if (items.filter(candidate => key(candidate) === prior.id).length > 1) throw new Error("Forked typed-fact supersession rejected");
    }
  };
  validateSupersession(input.promises, item => item.supersedesPromiseId, (prior, next) => sameInvoices(prior.invoiceIds, next.invoiceIds));
  validateSupersession(input.paymentClaims, item => item.supersedesClaimId, (prior, next) => sameInvoices(prior.invoiceIds, next.invoiceIds));
  validateSupersession(input.disputes, item => item.supersedesDisputeId, (prior, next) => prior.invoiceId === next.invoiceId);
}

export function deriveCollectionInteractionContext(input: CollectionInteractionContextInput): CollectionInteractionContext {
  validate(input);
  const promiseSuperseded = supersededIds(input.promises, item => item.supersedesPromiseId);
  const claimSuperseded = supersededIds(input.paymentClaims, item => item.supersedesClaimId);
  const disputeSuperseded = supersededIds(input.disputes, item => item.supersedesDisputeId);
  const paymentVerificationEvents = effectiveCollectionEvents(input.collectionEvents).filter(event => event.type === "PAYMENT_VERIFIED");
  const verificationByClaimId = new Map(paymentVerificationEvents.map(event => [String(event.data?.claimEventId ?? ""), event]));
  const verifiedClaimIds = new Set(verificationByClaimId.keys());
  const claims: DerivedPaymentClaim[] = input.paymentClaims.map(claim => deepFreeze({ ...claim, invoiceIds: [...claim.invoiceIds], evidenceRefs: [...claim.evidenceRefs], status: claimSuperseded.has(claim.id) ? "SUPERSEDED" : verifiedClaimIds.has(claim.id) ? "VERIFIED" : claim.resolution === "REJECTED" ? "REJECTED" : "PENDING_VERIFICATION" }));
  const promises: DerivedPromise[] = input.promises.map(promise => {
    const directPayments = input.confirmedPromisePayments.filter(payment => payment.promiseId === promise.id);
    const directPaidCents = directPayments.reduce((sum, payment) => sum + payment.amountCents, 0);
    const compatibleVerifiedClaims = claims.filter(claim => claim.status === "VERIFIED" && claim.invoiceIds.every(invoiceId => promise.invoiceIds.includes(invoiceId)));
    const claimContributions = compatibleVerifiedClaims.filter(claim => claim.claimedAmountCents !== undefined).map(claim => claim.claimedAmountCents!);
    // Without a shared identity, summing the two representations could count one payment twice.
    const verifiedClaimPaidCents = claimContributions.length ? Math.max(...claimContributions) : 0;
    const confirmedPaidCents = Math.max(directPaidCents, verifiedClaimPaidCents);
    const claimCanFulfill = compatibleVerifiedClaims.some(claim => sameInvoices(claim.invoiceIds, promise.invoiceIds) && (claim.claimedAmountCents ?? 0) >= promise.amountCents);
    const ambiguousClaims = claims.filter(claim => claim.status === "VERIFIED" && claim.invoiceIds.some(invoiceId => promise.invoiceIds.includes(invoiceId)) && (!sameInvoices(claim.invoiceIds, promise.invoiceIds) || claim.claimedAmountCents === undefined));
    const fulfillmentBlockers = ambiguousClaims.length ? ["VERIFIED_PAYMENT_ALLOCATION_UNCLEAR"] : [];
    const fulfillmentEvidenceRefs = unique([...directPayments.flatMap(payment => payment.financialEvidenceRefs), ...compatibleVerifiedClaims.flatMap(claim => [...claim.evidenceRefs, ...(verificationByClaimId.get(claim.id)?.evidenceRefs ?? [])])]);
    const status: DerivedPromise["status"] = promiseSuperseded.has(promise.id) ? "SUPERSEDED" : directPaidCents >= promise.amountCents || claimCanFulfill ? "FULFILLED" : promise.promisedDate < input.asOf.slice(0, 10) ? "BROKEN" : "ACTIVE";
    return deepFreeze({ ...promise, invoiceIds: [...promise.invoiceIds], evidenceRefs: [...promise.evidenceRefs], status, confirmedPaidCents, fulfillmentEvidenceRefs, fulfillmentBlockers });
  });
  const disputes: DerivedDispute[] = input.disputes.map(dispute => deepFreeze({ ...dispute, evidenceRefs: [...dispute.evidenceRefs], derivedStatus: disputeSuperseded.has(dispute.id) ? "SUPERSEDED" : dispute.status }));
  const chronology: CollectionChronologyEntry[] = [
    ...input.collectionEvents.map(event => ({ id: `event:${event.id}`, kind: event.type, occurredAt: event.occurredAt, relatedInvoiceIds: event.relatedInvoiceId ? [event.relatedInvoiceId] : [], evidenceRefs: [...event.evidenceRefs] })),
    ...input.interactions.map(item => ({ id: `interaction:${item.id}`, kind: item.type, occurredAt: item.occurredAt, relatedInvoiceIds: [...item.relatedInvoiceIds], contactId: item.contactId, evidenceRefs: [...item.evidenceRefs] })),
    ...promises.flatMap(item => [{ id: `promise:${item.id}`, kind: "PROMISE" as const, occurredAt: item.recordedAt, relatedInvoiceIds: [...item.invoiceIds], contactId: item.contactId, evidenceRefs: [...item.evidenceRefs] }, ...(item.status === "BROKEN" ? [{ id: `promise-broken:${item.id}`, kind: "PROMISE_BROKEN" as const, occurredAt: `${item.promisedDate}T23:59:59.999Z`, relatedInvoiceIds: [...item.invoiceIds], contactId: item.contactId, evidenceRefs: [...item.evidenceRefs] }] : [])]),
    ...claims.map(item => ({ id: `claim:${item.id}`, kind: "PAYMENT_CLAIM" as const, occurredAt: item.recordedAt, relatedInvoiceIds: [...item.invoiceIds], contactId: item.contactId, evidenceRefs: [...item.evidenceRefs] })),
    ...disputes.map(item => ({ id: `dispute:${item.id}`, kind: "DISPUTE" as const, occurredAt: item.occurredAt, relatedInvoiceIds: [item.invoiceId], contactId: item.contactId, evidenceRefs: [...item.evidenceRefs] })),
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id));
  const blockers = unique([...(claims.some(item => item.status === "PENDING_VERIFICATION") ? ["PAYMENT_TO_VERIFY"] : []), ...(disputes.some(item => item.derivedStatus === "OPEN") ? ["OPEN_DISPUTE"] : []), ...promises.flatMap(item => item.fulfillmentBlockers), ...input.contactResolution.blockers]);
  return deepFreeze({ organizationId: input.organizationId, caseId: input.case.id, asOf: input.asOf, lastContactAttempt: cloneInteraction(latest(input.interactions, "CONTACT_ATTEMPTED")), lastDelivery: cloneInteraction(latest(input.interactions, "CONTACT_DELIVERED")), lastResponse: cloneInteraction(latest(input.interactions, "RESPONSE_RECEIVED")), activePromises: promises.filter(item => item.status === "ACTIVE"), brokenPromises: promises.filter(item => item.status === "BROKEN"), fulfilledPromises: promises.filter(item => item.status === "FULFILLED"), supersededPromises: promises.filter(item => item.status === "SUPERSEDED"), pendingPaymentClaims: claims.filter(item => item.status === "PENDING_VERIFICATION"), verifiedPaymentClaims: claims.filter(item => item.status === "VERIFIED"), rejectedPaymentClaims: claims.filter(item => item.status === "REJECTED"), supersededPaymentClaims: claims.filter(item => item.status === "SUPERSEDED"), openDisputes: disputes.filter(item => item.derivedStatus === "OPEN"), resolvedDisputes: disputes.filter(item => item.derivedStatus === "RESOLVED"), supersededDisputes: disputes.filter(item => item.derivedStatus === "SUPERSEDED"), relevantContacts: structuredClone(input.contactResolution), chronology, blockers });
}

const projectedEvent = (event: CollectionEvent): CollectionEvent => deepFreeze(event);
export function projectCollectionCaseWithInteractionContext(input: InteractionProjectionBridgeInput): CaseProjection {
  const context = input.interactionContext;
  if (input.projectionInput.organizationId !== context.organizationId || input.projectionInput.case.id !== context.caseId) throw new Error("Interaction projection bridge scope mismatch");
  const typedEvents: CollectionEvent[] = [
    ...[...context.activePromises, ...context.brokenPromises].flatMap(item => item.invoiceIds.map(invoiceId => projectedEvent({ id: `context:promise:${item.id}:${invoiceId}`, organizationId: item.organizationId, caseId: item.caseId, type: "PROMISE_RECORDED", occurredAt: item.recordedAt, actor: { kind: "HUMAN", id: item.confirmedBy }, reason: "Canonical interaction promise", evidenceRefs: item.evidenceRefs, relatedInvoiceId: invoiceId, data: { promisedFor: item.promisedDate } }))),
    ...context.pendingPaymentClaims.flatMap(item => [...item.invoiceIds].sort().map(invoiceId => projectedEvent({ id: `context:claim:${item.id}:${invoiceId}`, organizationId: item.organizationId, caseId: item.caseId, type: "PAYMENT_CLAIM_RECORDED", occurredAt: item.recordedAt, actor: { kind: "HUMAN", id: item.confirmedBy }, reason: "Canonical payment claim", evidenceRefs: item.evidenceRefs, relatedInvoiceId: invoiceId, data: { claimId: item.id } }))),
    ...context.openDisputes.map(item => projectedEvent({ id: `context:dispute:${item.id}`, organizationId: item.organizationId, caseId: item.caseId, type: "DISPUTE_OPENED", occurredAt: item.occurredAt, actor: { kind: "HUMAN", id: item.confirmedBy }, reason: item.reason, evidenceRefs: item.evidenceRefs, relatedInvoiceId: item.invoiceId })),
  ];
  return projectCollectionCase({ ...input.projectionInput, asOf: context.asOf, events: [...input.collectionEvents, ...typedEvents], contactAvailable: context.relevantContacts.readyContacts.length > 0 });
}
