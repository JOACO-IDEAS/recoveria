import { deepFreeze } from "@/lib/domain/evidence";
import type { CommunicationDraft, CommunicationDraftProvider, CommunicationDraftRequest, CommunicationPreparationEvaluation, CommunicationPreparationInput, DraftApproval } from "./types";
import { communicationSnapshotFingerprint } from "./eligibility";
import { validateCommunicationDraft } from "./validator";

const pesos = (cents: number) => `$${Math.trunc(cents / 100).toLocaleString("es-AR")}`;

export function createCommunicationDraftRequest(evaluation: CommunicationPreparationEvaluation, input: { readonly id: string; readonly requestedAt: string; readonly requestedBy: string }): CommunicationDraftRequest {
  if (evaluation.outcome !== "READY_FOR_DRAFT" || !evaluation.authorizedFacts || !evaluation.intent || !evaluation.selectedContact || !evaluation.selectedChannel) throw new Error("Communication draft request requires a ready preparation evaluation");
  if (!input.id || !input.requestedAt || !input.requestedBy) throw new Error("Draft request requires explicit identity, time, and human requester");
  return deepFreeze({ organizationId: evaluation.authorizedFacts.organizationId, caseId: evaluation.authorizedFacts.caseId, contactId: evaluation.selectedContact.contact.id, channelId: evaluation.selectedChannel.id, intent: evaluation.intent, authorizedFacts: evaluation.authorizedFacts, tonePolicy: "PROFESSIONAL_NEUTRAL", language: "es-AR", evidenceRefs: [...evaluation.authorizedFacts.evidenceRefs], requestedAt: input.requestedAt, requestedBy: input.requestedBy, snapshotFingerprint: evaluation.snapshotFingerprint, id: input.id });
}

export class DeterministicTemplateDraftProvider implements CommunicationDraftProvider {
  readonly id = "recoveria-deterministic-communication-v1";

  draft(request: CommunicationDraftRequest): CommunicationDraft {
    const facts = request.authorizedFacts;
    const greeting = `Hola ${facts.contactName},`;
    const amount = pesos(facts.targetOutstandingCents);
    const invoiceList = facts.invoiceFacts.map(invoice => invoice.invoiceNumber).join(", ");
    let body: string;
    if (request.intent === "INITIAL_COLLECTION_CONTACT") body = `${greeting} te contactamos por facturas pendientes asociadas a ${facts.buildingDisplayName}. Según nuestros registros, el importe pendiente considerado para este contacto es de ${amount} (${invoiceList}). Si ya fue abonado o necesitás revisar alguna factura, por favor avisanos.`;
    else if (request.intent === "FOLLOW_UP") body = `${greeting} retomamos el contacto por las facturas pendientes asociadas a ${facts.buildingDisplayName}, por un importe considerado de ${amount} (${invoiceList}). Si ya fueron abonadas o necesitás revisar la información, por favor avisanos.`;
    else if (request.intent === "PROMISE_FOLLOW_UP") body = `${greeting} retomamos el contacto por el compromiso de pago registrado para el ${facts.relevantPromise!.promisedDate}, asociado a ${facts.buildingDisplayName} y a las facturas ${invoiceList}. Si necesitás revisar la información, por favor avisanos.`;
    else if (request.intent === "PAYMENT_VERIFICATION_REQUEST") body = `${greeting} nos informaron un pago asociado a ${facts.buildingDisplayName} y a las facturas ${invoiceList}, que todavía estamos verificando. Si podés compartir el comprobante o los datos de la operación, podremos completar la revisión.`;
    else body = `${greeting} necesitamos confirmar información relacionada con ${facts.buildingDisplayName} y las facturas ${invoiceList}. Por favor avisanos si sos la persona indicada para revisarla.`;
    return deepFreeze({ id: `draft:${request.id}`, requestId: request.id, organizationId: request.organizationId, caseId: request.caseId, contactId: request.contactId, channelId: request.channelId, intent: request.intent, subject: facts.channel.type === "EMAIL" ? `Consulta sobre ${facts.buildingDisplayName}` : undefined, body, channel: facts.channel.type as "EMAIL" | "WHATSAPP", createdAt: request.requestedAt, draftingMethod: "DETERMINISTIC_TEMPLATE", factRefs: facts.facts.filter(fact => fact.category === "FACT" || fact.category === "HUMAN_DECISION").map(fact => fact.id), evidenceRefs: [...request.evidenceRefs], warnings: [], requiresHumanApproval: true, snapshotFingerprint: request.snapshotFingerprint });
  }
}

export function createValidatedCommunicationDraft(provider: CommunicationDraftProvider, request: CommunicationDraftRequest): CommunicationDraft {
  const draft = provider.draft(request);
  const validation = validateCommunicationDraft(draft, request);
  if (!validation.valid) throw new Error(`Unsafe communication draft rejected: ${validation.errors.join(", ")}`);
  return draft;
}

export function recordDraftApproval(draft: CommunicationDraft, input: Omit<DraftApproval, "draftId" | "organizationId">): DraftApproval {
  if (!input.id || !input.actor || (input.actor.kind !== "HUMAN" && input.actor.kind !== "SYSTEM") || !input.actor.id || !input.decidedAt) throw new Error("Draft approval decision requires an explicit valid actor and time");
  const draftTime = Date.parse(draft.createdAt);
  const decisionTime = Date.parse(input.decidedAt);
  if (!Number.isFinite(draftTime) || !Number.isFinite(decisionTime) || decisionTime < draftTime) throw new Error("Draft approval cannot predate draft creation");
  return deepFreeze({ ...input, actor: { ...input.actor }, organizationId: draft.organizationId, draftId: draft.id });
}

export function isCommunicationDraftStale(draft: CommunicationDraft, current: CommunicationPreparationInput): boolean {
  return draft.snapshotFingerprint !== communicationSnapshotFingerprint(current);
}
