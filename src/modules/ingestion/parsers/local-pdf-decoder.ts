import { normalizeCuit, normalizeDate, parseArgentineAmount } from "../normalization";
import type { RawInvoiceRecord } from "../raw-record";
import type {
  DocumentObservation,
  ExtractionConfidence,
  ObservedCandidate,
  RelationshipCandidate,
  SemanticDateCandidate,
  SourceEvidence,
  StructuredDocumentUnderstanding,
} from "../types";

const PARSER_VERSION = "recoveria-local-pdf-v1";
const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

interface PdfTextItem { readonly str: string; readonly width: number; readonly height: number; readonly transform: readonly number[] }
interface Line { readonly text: string; readonly observationIds: readonly string[] }

class TextExtractionDomMatrix {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  constructor(init?: readonly number[]) {
    if (init?.length === 6) [this.a, this.b, this.c, this.d, this.e, this.f] = init;
  }
  multiplySelf(other: TextExtractionDomMatrix): this {
    const { a, b, c, d, e, f } = this;
    this.a = a * other.a + c * other.b; this.b = b * other.a + d * other.b;
    this.c = a * other.c + c * other.d; this.d = b * other.c + d * other.d;
    this.e = a * other.e + c * other.f + e; this.f = b * other.e + d * other.f + f;
    return this;
  }
  preMultiplySelf(other: TextExtractionDomMatrix): this {
    const copy = new TextExtractionDomMatrix([other.a, other.b, other.c, other.d, other.e, other.f]).multiplySelf(this);
    Object.assign(this, copy); return this;
  }
  translate(x = 0, y = 0): this { return this.multiplySelf(new TextExtractionDomMatrix([1, 0, 0, 1, x, y])); }
  scale(x = 1, y = x): this { return this.multiplySelf(new TextExtractionDomMatrix([x, 0, 0, y, 0, 0])); }
  invertSelf(): this {
    const determinant = this.a * this.d - this.b * this.c;
    if (!determinant) return this;
    const { a, b, c, d, e, f } = this;
    this.a = d / determinant; this.b = -b / determinant; this.c = -c / determinant; this.d = a / determinant;
    this.e = (c * f - d * e) / determinant; this.f = (b * e - a * f) / determinant;
    return this;
  }
}

const unavailable = <T>(): ObservedCandidate<T> => ({ raw: null, normalized: null, status: "MISSING", confidence: "UNAVAILABLE", classification: "UNKNOWN", observationIds: [] });

function candidate<T>(raw: string | undefined, normalized: T | null, observationIds: readonly string[], confidence: ExtractionConfidence = "HIGH", classification: "FACT" | "INFERENCE" = "FACT"): ObservedCandidate<T> {
  if (!raw) return unavailable<T>();
  return { raw, normalized, status: normalized === null ? "UNCERTAIN" : "EXTRACTED", confidence, classification, observationIds };
}

function linesFrom(observations: readonly DocumentObservation[]): readonly Line[] {
  const sorted = [...observations].sort((a, b) => a.page - b.page || b.region.y - a.region.y || a.region.x - b.region.x);
  const rows: Array<{ page: number; y: number; items: DocumentObservation[] }> = [];
  for (const item of sorted) {
    const row = rows.find((entry) => entry.page === item.page && Math.abs(entry.y - item.region.y) <= Math.max(2, item.region.height * 0.35));
    if (row) row.items.push(item);
    else rows.push({ page: item.page, y: item.region.y, items: [item] });
  }
  return rows.map(({ items }) => {
    const ordered = [...items].sort((a, b) => a.region.x - b.region.x);
    let text = "";
    let priorEnd: number | null = null;
    for (const item of ordered) {
      const gap = priorEnd === null ? 0 : item.region.x - priorEnd;
      if (text && gap > Math.max(1.5, item.region.height * 0.15)) text += " ";
      text += item.observedText;
      priorEnd = item.region.x + item.region.width;
    }
    return { text: text.replace(/\s+/g, " ").trim(), observationIds: ordered.map(({ id }) => id) };
  }).filter(({ text }) => text.length > 0);
}

function match(lines: readonly Line[], pattern: RegExp, group = 1): { raw: string; ids: readonly string[] } | undefined {
  for (const line of lines) {
    const found = line.text.match(pattern);
    if (found?.[group]) return { raw: found[group].trim(), ids: line.observationIds };
  }
  const joined = lines.map(({ text }) => text).join(" ");
  const found = joined.match(pattern);
  return found?.[group] ? { raw: found[group].trim(), ids: lines.flatMap(({ observationIds }) => observationIds) } : undefined;
}

function semanticDate(raw: string | undefined, semantic: SemanticDateCandidate["semantic"], ids: readonly string[], confidence: ExtractionConfidence = "HIGH", classification: "FACT" | "INFERENCE" = "FACT"): SemanticDateCandidate {
  const value = raw ? normalizeDate(raw) : null;
  return { ...candidate(raw, value, ids, confidence, classification), semantic };
}

function evidence(documentId: string, rawValue: string, observations: readonly DocumentObservation[], ids: readonly string[]): SourceEvidence {
  const observation = observations.find(({ id }) => ids.includes(id));
  return {
    documentId,
    location: {
      kind: "PDF_TEXT", page: observation?.page ?? 1, textSpan: ids.join(","), region: observation?.region,
      extractionMethod: "LOCAL_PDF_NATIVE", parserVersion: PARSER_VERSION,
    },
    rawValue,
  };
}

function periodFrom(lines: readonly Line[]): { start: ObservedCandidate<string>; end: ObservedCandidate<string> } {
  const found = match(lines, new RegExp(`\\b(${Object.keys(MONTHS).join("|")})\\s+(20\\d{2})\\b`, "i"), 0);
  if (!found) return { start: unavailable(), end: unavailable() };
  const parts = found.raw.toLowerCase().match(new RegExp(`(${Object.keys(MONTHS).join("|")})\\s+(20\\d{2})`));
  if (!parts) return { start: unavailable(), end: unavailable() };
  const month = MONTHS[parts[1]];
  const year = Number(parts[2]);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${endDay}`;
  return {
    start: candidate(found.raw, start, found.ids, "MEDIUM", "INFERENCE"),
    end: candidate(found.raw, end, found.ids, "MEDIUM", "INFERENCE"),
  };
}

function buildUnderstanding(documentId: string, observations: readonly DocumentObservation[]): StructuredDocumentUnderstanding {
  const lines = linesFrom(observations);
  const invoice = match(lines, /(?:N[°ºo]\s*:?\s*)?(\d{4})\s*-\s*(\d{5,10})\b/i, 0);
  const invoiceParts = invoice?.raw.match(/(\d{4})\s*-\s*(\d{5,10})/);
  const issue = match(lines, /\bFecha\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/i);
  const fiscalExpiry = match(lines, /\bVto\.?\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/i);
  const registration = match(lines, /\bInicio\s+de\s+actividades\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/i);
  const paymentDue = match(lines, /(?:Fecha\s+de\s+)?Vencimiento(?:\s+de\s+pago)?\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/i);
  const fiscal = match(lines, /\bCAE\s*:?\s*(\d{10,16})\b/i);
  const taxIdMap = new Map<string, { raw: string; ids: readonly string[] }>();
  for (const line of lines) for (const entry of line.text.matchAll(/\b(?:CUIT\s*:?\s*)?(\d{2}[- ]?\d{8}[- ]?\d)\b/gi)) {
    const raw = entry[1];
    taxIdMap.set(raw.replace(/\D/g, ""), { raw, ids: line.observationIds });
  }
  const taxIds = [...taxIdMap.values()];
  const currencyRaw = match(lines, /\bMoneda\s*:?\s*(Peso(?:s)?|ARS)\b/i);
  const currency = currencyRaw ? candidate(currencyRaw.raw, /peso/i.test(currencyRaw.raw) ? "ARS" : currencyRaw.raw.toUpperCase(), currencyRaw.ids) : unavailable<string>();
  const totals = lines.flatMap((line) => [...line.text.matchAll(/\bTOTAL\s*\$?\s*([0-9][0-9.,]*)\b/gi)].map((entry) => ({ raw: entry[1], ids: line.observationIds })));
  const total = totals.at(-1);
  const parsedTotal = total ? parseArgentineAmount(total.raw) : null;
  const tax = match(lines, /\bIVA\s+Contenido\s*:?\s*\$?\s*([0-9][0-9.,]*)\b/i);
  const descriptionLine = lines.filter(({ text }) => /\b(trabajo|abono|servicio|mantenimiento|reparaci[oó]n|suministro)\b/i.test(text)).sort((a, b) => b.text.length - a.text.length)[0];
  const quote = match(lines, /\bpresupuesto(?:\s+de\s+fecha)?\s+(\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/i);
  const stage = match(lines, /\b(ANTICIPO(?:\s+\d+\s*%)?|SALDO|CUOTA\s+\d+\s+DE\s+\d+)\b/i);
  const service = periodFrom(lines);
  const documentTypeRaw = match(lines, /\b(FACTURA|NOTA\s+DE\s+(?:CR[EÉ]DITO|D[EÉ]BITO))\b/i);
  const customerName = match(lines, /\bRaz[oó]n\s+Social\s*:?\s*(.+)$/i);
  const customerAddress = match(lines, /\bDomicilio\s*:?\s*(.+)$/i);
  const dates = [
    semanticDate(issue?.raw, "ISSUE_DATE", issue?.ids ?? []),
    semanticDate(paymentDue?.raw, "PAYMENT_DUE_DATE", paymentDue?.ids ?? []),
    semanticDate(fiscalExpiry?.raw, "FISCAL_AUTHORIZATION_EXPIRY", fiscalExpiry?.ids ?? []),
    semanticDate(registration?.raw, "ISSUER_REGISTRATION_DATE", registration?.ids ?? []),
  ];
  if (quote) dates.push(semanticDate(quote.raw.replace(/\./g, "/"), "OTHER_DATE", quote.ids, "MEDIUM", "FACT"));
  if (service.start.normalized) dates.push({ ...service.start, semantic: "SERVICE_PERIOD_START" });
  if (service.end.normalized) dates.push({ ...service.end, semantic: "SERVICE_PERIOD_END" });
  const relationshipCandidates: RelationshipCandidate[] = [];
  if (stage) relationshipCandidates.push({ kind: /CUOTA/i.test(stage.raw) ? "POSSIBLE_INSTALLMENT_OF" : "POSSIBLE_STAGE_OF", status: "CANDIDATE", confidence: "MEDIUM", classification: "INFERENCE", observationIds: stage.ids });
  if (quote && descriptionLine) relationshipCandidates.push({ kind: "POSSIBLE_PROJECT_GROUP", status: "CANDIDATE", confidence: "LOW", classification: "INFERENCE", observationIds: [...new Set([...quote.ids, ...descriptionLine.observationIds])] });
  return {
    providerId: PARSER_VERSION,
    observations,
    documentType: candidate(documentTypeRaw?.raw, documentTypeRaw?.raw.toUpperCase() ?? null, documentTypeRaw?.ids ?? []),
    pointOfSale: candidate(invoiceParts?.[1], invoiceParts?.[1] ?? null, invoice?.ids ?? []),
    invoiceNumber: candidate(invoice?.raw, invoiceParts ? `${invoiceParts[1]}-${invoiceParts[2]}` : null, invoice?.ids ?? []),
    dates,
    fiscalAuthorizationId: candidate(fiscal?.raw, fiscal?.raw ?? null, fiscal?.ids ?? []),
    issuerTaxId: candidate(taxIds[0]?.raw, taxIds[0] ? normalizeCuit(taxIds[0].raw) : null, taxIds[0]?.ids ?? []),
    customerTaxId: candidate(taxIds[1]?.raw, taxIds[1] ? normalizeCuit(taxIds[1].raw) : null, taxIds[1]?.ids ?? []),
    issuerName: unavailable(),
    customerName: candidate(customerName?.raw, customerName?.raw ?? null, customerName?.ids ?? [], "MEDIUM"),
    issuerAddress: unavailable(),
    customerAddress: candidate(customerAddress?.raw, customerAddress?.raw ?? null, customerAddress?.ids ?? [], "MEDIUM"),
    currency,
    subtotalCents: unavailable(),
    taxComponents: tax ? [candidate(tax.raw, parseArgentineAmount(tax.raw), tax.ids)] : [],
    documentedNominalTotalCents: candidate(total?.raw, parsedTotal, total?.ids ?? []),
    description: candidate(descriptionLine?.text, descriptionLine?.text ?? null, descriptionLine?.observationIds ?? [], "MEDIUM"),
    servicePeriodStart: service.start,
    servicePeriodEnd: service.end,
    quotationReference: candidate(quote?.raw, quote?.raw ?? null, quote?.ids ?? [], "MEDIUM"),
    installmentStage: candidate(stage?.raw, stage?.raw.toUpperCase() ?? null, stage?.ids ?? [], "MEDIUM", "INFERENCE"),
    relationshipCandidates,
  };
}

function rawRecord(documentId: string, understanding: StructuredDocumentUnderstanding): RawInvoiceRecord {
  const issue = understanding.dates.find(({ semantic }) => semantic === "ISSUE_DATE");
  const due = understanding.dates.find(({ semantic }) => semantic === "PAYMENT_DUE_DATE");
  const values: Record<string, string> = {};
  const sources: Array<[string, ObservedCandidate<unknown> | undefined]> = [
    ["invoiceNumber", understanding.invoiceNumber], ["invoiceDate", issue], ["dueDate", due],
    ["amount", understanding.documentedNominalTotalCents], ["currency", understanding.currency],
    ["issuer", understanding.issuerName], ["billedParty", understanding.customerName],
    ["cuit", understanding.customerTaxId], ["building", understanding.customerName],
    ["address", understanding.customerAddress], ["description", understanding.description],
  ];
  const evidenceMap: Record<string, SourceEvidence> = {};
  for (const [key, field] of sources) {
    if (!field?.raw) continue;
    values[key] = field.raw;
    evidenceMap[key] = evidence(documentId, field.raw, understanding.observations, field.observationIds);
  }
  return { values, evidence: evidenceMap, understanding };
}

export async function decodeLocalPdf(documentId: string, bytes: Uint8Array): Promise<RawInvoiceRecord> {
  if (!globalThis.DOMMatrix) globalThis.DOMMatrix = TextExtractionDomMatrix as unknown as typeof DOMMatrix;
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({ data: bytes.slice(), verbosity: 0 });
  const pdf = await loading.promise;
  const observations: DocumentObservation[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const textItem = item as PdfTextItem;
        observations.push({
          id: `${documentId}:p${pageNumber}:t${observations.length + 1}`,
          documentId, page: pageNumber, observationType: "TEXT", observedText: textItem.str,
          region: { x: textItem.transform[4] ?? 0, y: textItem.transform[5] ?? 0, width: textItem.width, height: textItem.height },
          extractionMethod: "LOCAL_PDF_NATIVE", parserVersion: PARSER_VERSION, confidence: "HIGH",
        });
      }
    }
  } finally {
    await pdf.destroy();
  }
  if (!observations.length) throw new Error("PDF_NATIVE_TEXT_UNAVAILABLE");
  return rawRecord(documentId, buildUnderstanding(documentId, observations));
}

export const __private__ = { buildUnderstanding, linesFrom };
