import { DeterministicDocumentUnderstandingProvider, type DocumentUnderstandingProvider } from "@/modules/ingestion/document-understanding-provider";
import type { ExtractedField, InvoiceCandidate } from "@/modules/ingestion/types";
import { buildSyntheticDocumentCorpus, SYNTHETIC_ENTITY_CATALOG } from "@/test/fixtures/document-corpus";
import type { ImportScenario, ImportScenarioKind } from "./intelligent-import-types";

export const DEMO_IMPORT_ORGANIZATION_ID = "org-recoveria-synthetic";


const definitions: ReadonlyArray<{ documentId: string; kind: ImportScenarioKind; title: string; explanation: string }> = [
  { documentId: "pdf-1", kind: "SUCCESS", title: "Factura PDF válida", explanation: "Texto nativo interpretado con campos y entidad consistentes." },
  { documentId: "pdf-21", kind: "MISSING", title: "Falta el vencimiento", explanation: "La factura es legible, pero necesita una decisión sobre un dato obligatorio ausente." },
  { documentId: "pdf-24", kind: "AMBIGUOUS", title: "Campos ambiguos", explanation: "El documento contiene dos importes y una administración con más de una coincidencia." },
  { documentId: "pdf-24", kind: "CONTRADICTORY", title: "Evidencia contradictoria", explanation: "Dos valores del mismo campo se contradicen; RecoverIA no elige silenciosamente." },
  { documentId: "doc-39", kind: "EXACT_DUPLICATE", title: "Duplicado confirmado", explanation: "El contenido coincide exactamente con un documento ya procesado." },
  { documentId: "doc-40", kind: "POSSIBLE_DUPLICATE", title: "Posible duplicado", explanation: "Los datos de negocio coinciden, aunque el archivo no es idéntico." },
  { documentId: "pdf-25", kind: "SCANNED", title: "PDF escaneado", explanation: "No hay texto nativo disponible; se deriva a revisión sin inventar datos." },
  { documentId: "doc-37", kind: "UNSUPPORTED", title: "Formato no compatible", explanation: "El documento no pertenece a un formato de factura admitido." },
];

function field<T>(source: ExtractedField<T>) {
  return { raw: source.raw, value: source.normalized, status: source.status, evidence: source.evidence.map(item => item.rawValue), issues: source.issues };
}

function invoiceView(candidate: InvoiceCandidate) {
  return {
    number: field(candidate.invoiceNumber), invoiceDate: field(candidate.invoiceDate), dueDate: field(candidate.dueDate),
    amountCents: field(candidate.amountCents), currency: field(candidate.currency), issuer: field(candidate.issuer),
    billedParty: field(candidate.billedParty), cuit: field(candidate.cuit), administration: field(candidate.administration),
    building: field(candidate.building), description: field(candidate.description),
    entity: { status: candidate.administrationSignal.status, candidateIds: candidate.administrationSignal.candidateIds },
  };
}

export async function buildIntelligentImportScenarios(provider: DocumentUnderstandingProvider = new DeterministicDocumentUnderstandingProvider()): Promise<readonly ImportScenario[]> {
  const { documents } = await buildSyntheticDocumentCorpus();
  const batch = await provider.understand({ organizationId: DEMO_IMPORT_ORGANIZATION_ID, idempotencyKey: "phase-5a-demo-workspace", documents, entityCatalog: SYNTHETIC_ENTITY_CATALOG });
  return definitions.map(definition => {
    const document = documents.find(item => item.id === definition.documentId)!;
    const result = batch.results.find(item => item.documentId === definition.documentId)!;
    const duplicate = batch.duplicateFindings.find(item => item.documentId === definition.documentId) ?? null;
    return { id: `${definition.kind.toLowerCase()}-${definition.documentId}`, kind: definition.kind, title: definition.title, fileName: document.fileName, format: result.classification.format, status: result.status, explanation: definition.explanation, reviewReasons: result.reviewReasons, duplicate, invoice: result.candidates[0] ? invoiceView(result.candidates[0]) : null };
  });
}
