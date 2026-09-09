import ExcelJS from "exceljs";
import { normalizeCuit, normalizeDate, normalizeName, parseArgentineAmount } from "@/modules/ingestion/normalization";
import type { EntityCatalogEntry } from "@/modules/ingestion/candidate-builder";
import type { DocumentFormat, DocumentInput, ParserStatus } from "@/modules/ingestion/types";

const ORG = "org-recoveria-synthetic";
const HEADERS = ["invoiceNumber", "invoiceDate", "dueDate", "amount", "currency", "issuer", "billedParty", "cuit", "administration", "building", "address", "description"] as const;
type FixtureRow = Record<(typeof HEADERS)[number], string>;

export interface ExpectedInvoiceCandidate {
  readonly invoiceNumber: string | null;
  readonly invoiceDate: string | null;
  readonly dueDate: string | null;
  readonly amountCents: number | null;
  readonly currency: string | null;
  readonly issuer: string | null;
  readonly billedParty: string | null;
  readonly cuit: string | null;
  readonly administration: string | null;
  readonly building: string | null;
}

export interface DocumentTruth {
  readonly documentId: string;
  readonly expectedFormat: DocumentFormat;
  readonly expectedStatus: ParserStatus;
  readonly expectedReview: boolean;
  readonly expectedDuplicate?: "EXACT_DOCUMENT_DUPLICATE" | "POSSIBLE_BUSINESS_DUPLICATE";
  readonly expectedCandidates: readonly ExpectedInvoiceCandidate[];
}

const row = (number: string, overrides: Partial<FixtureRow> = {}): FixtureRow => ({
  invoiceNumber: number, invoiceDate: "15/07/2026", dueDate: "15/08/2026", amount: "123.456,78", currency: "ARS",
  issuer: "Ascensores Horizonte S.A.", billedParty: `Consorcio ${number}`, cuit: "30-71234567-8",
  administration: "Administración García SRL", building: `Consorcio ${number}`, address: "Calle Ficticia 123", description: "Mantenimiento sintético",
  ...overrides,
});

function expected(source: FixtureRow): ExpectedInvoiceCandidate {
  return {
    invoiceNumber: source.invoiceNumber || null,
    invoiceDate: source.invoiceDate ? normalizeDate(source.invoiceDate) : null,
    dueDate: source.dueDate ? normalizeDate(source.dueDate) : null,
    amountCents: source.amount && !source.amount.includes("|") ? parseArgentineAmount(source.amount) : null,
    currency: source.currency ? source.currency.toUpperCase() : null,
    issuer: source.issuer ? normalizeName(source.issuer) : null,
    billedParty: source.billedParty ? normalizeName(source.billedParty) : null,
    cuit: source.cuit ? normalizeCuit(source.cuit) : null,
    administration: source.administration ? normalizeName(source.administration) : null,
    building: source.building ? normalizeName(source.building) : null,
  };
}

function escapePdf(value: string): string { return value.replace(/([()\\])/g, "\\$1"); }

function nativePdf(source: FixtureRow, unusualOrder = false): Uint8Array {
  const labels: Record<keyof FixtureRow, string> = { invoiceNumber: "NUMERO", invoiceDate: "FECHA", dueDate: "VENCIMIENTO", amount: "IMPORTE", currency: "MONEDA", issuer: "EMISOR", billedParty: "FACTURADO_A", cuit: "CUIT", administration: "ADMINISTRACION", building: "CONSORCIO", address: "DIRECCION", description: "CONCEPTO" };
  let fields = HEADERS.flatMap((key) => source[key].split("|").filter(Boolean).map((value) => `${labels[key]}:${value}`));
  if (unusualOrder) fields = [...fields].reverse();
  const operators = fields.map((value) => `BT (${escapePdf(value)}) Tj ET`).join("\n");
  return new TextEncoder().encode(`%PDF-1.4\n% RecoverIA synthetic native-text fixture\n${operators}\n%%EOF`);
}

function scannedPdf(id: string): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.4\n% RECOVERIA_SCAN_ONLY ${id}\n1 0 obj << /Subtype /Image >> endobj\n%%EOF`);
}

function csvBytes(rows: readonly FixtureRow[]): Uint8Array {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return new TextEncoder().encode([HEADERS.join(","), ...rows.map((item) => HEADERS.map((key) => quote(item[key])).join(","))].join("\n"));
}

async function xlsxBytes(rows: readonly FixtureRow[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RecoverIA synthetic fixture";
  workbook.created = new Date("2026-01-01T00:00:00.000Z");
  workbook.modified = new Date("2026-01-01T00:00:00.000Z");
  const sheet = workbook.addWorksheet("Facturas");
  sheet.addRow([...HEADERS]);
  rows.forEach((item) => sheet.addRow(HEADERS.map((key) => item[key])));
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

const documentInput = (id: string, fileName: string, media: string, bytes: Uint8Array): DocumentInput => ({ id, organizationId: ORG, fileName, declaredMediaType: media, bytes });

export const SYNTHETIC_ENTITY_CATALOG: readonly EntityCatalogEntry[] = [
  { id: "adm1", aliases: ["Administración García SRL", "ADM. GARCIA S.R.L."] },
  { id: "adm2", aliases: ["Administración Río SRL"] },
  { id: "adm3", aliases: ["Administración Centro SRL"] },
  { id: "adm4", aliases: ["Administración Norte SRL", "ADM SUR"] },
  { id: "adm5", aliases: ["Administración Plaza SRL"] },
  { id: "adm6", aliases: ["Administración Sur SRL", "ADM SUR"] },
];

export async function buildSyntheticDocumentCorpus(): Promise<{ documents: readonly DocumentInput[]; truth: readonly DocumentTruth[] }> {
  const documents: DocumentInput[] = [];
  const truth: DocumentTruth[] = [];
  const push = (document: DocumentInput, expectedFormat: DocumentFormat, expectedStatus: ParserStatus, expectedReview: boolean, rows: readonly FixtureRow[] = [], expectedDuplicate?: DocumentTruth["expectedDuplicate"]) => {
    documents.push(document);
    truth.push({ documentId: document.id, expectedFormat, expectedStatus, expectedReview, expectedDuplicate, expectedCandidates: rows.map(expected) });
  };

  const pdfRows: FixtureRow[] = [];
  const adminNames = ["Administración García SRL", "Administración Río SRL", "Administración Centro SRL", "Administración Norte SRL", "Administración Plaza SRL", "Administración Sur SRL"];
  for (let index = 1; index <= 20; index += 1) {
    const item = row(`A-${String(index).padStart(4, "0")}`, {
      administration: adminNames[(index - 1) % adminNames.length],
      cuit: index % 2 ? "30-71234567-8" : "30712345678",
      amount: index === 5 ? "$ 1.234.567,89" : `${100_000 + index}.00`,
      invoiceDate: index === 6 ? "15-jul-2026" : "15/07/2026",
    });
    pdfRows.push(item);
    push(documentInput(`pdf-${index}`, `factura-${index}.pdf`, "application/pdf", nativePdf(item, index === 19)), "PDF_NATIVE", "PARSED", false, [item]);
  }
  const missingDue = row("A-0021", { dueDate: "" });
  push(documentInput("pdf-21", "sin-vencimiento.pdf", "application/pdf", nativePdf(missingDue)), "PDF_NATIVE", "REVIEW_REQUIRED", true, [missingDue]);
  const buildingOnly = row("A-0022", { administration: "" });
  push(documentInput("pdf-22", "solo-consorcio.pdf", "application/pdf", nativePdf(buildingOnly)), "PDF_NATIVE", "REVIEW_REQUIRED", true, [buildingOnly]);
  const abbreviation = row("A-0023", { administration: "ADM. GARCIA S.R.L." });
  push(documentInput("pdf-23", "administracion-abreviada.pdf", "application/pdf", nativePdf(abbreviation)), "PDF_NATIVE", "PARSED", false, [abbreviation]);
  const ambiguous = row("A-0024", { administration: "ADM SUR", amount: "100.000,00|120.000,00" });
  push(documentInput("pdf-24", "campos-conflictivos.pdf", "application/pdf", nativePdf(ambiguous)), "PDF_NATIVE", "REVIEW_REQUIRED", true, [ambiguous]);

  for (let index = 25; index <= 28; index += 1) push(documentInput(`pdf-${index}`, `escaneo-${index}.pdf`, "application/pdf", scannedPdf(`scan-${index}`)), "PDF_SCANNED", "REVIEW_REQUIRED", true);

  for (let index = 29; index <= 32; index += 1) {
    const rows = [row(`C-${index}-1`, { administration: adminNames[index % 6] }), row(`C-${index}-2`, { administration: adminNames[(index + 1) % 6], amount: "234.567,89" })];
    push(documentInput(`csv-${index}`, `export-${index}.csv`, "text/csv", csvBytes(rows)), "CSV", "PARSED", false, rows);
  }
  for (let index = 33; index <= 36; index += 1) {
    const rows = [row(`X-${index}-1`, { administration: adminNames[index % 6] }), row(`X-${index}-2`, { administration: adminNames[(index + 1) % 6], cuit: "30 71234567 8" })];
    push(documentInput(`xlsx-${index}`, `export-${index}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", await xlsxBytes(rows)), "XLSX", "PARSED", false, rows);
  }

  push(documentInput("doc-37", "not-an-invoice.txt", "text/plain", new TextEncoder().encode("This synthetic file is not an invoice.")), "UNSUPPORTED", "UNSUPPORTED", true);
  push(documentInput("doc-38", "malformed.pdf", "application/pdf", new TextEncoder().encode("%PDF-1.4\nBT (BROKEN) Tj ET")), "MALFORMED", "FAILED", true);
  push(documentInput("doc-39", "same-invoice-copy.pdf", "application/pdf", documents[0].bytes), "PDF_NATIVE", "REVIEW_REQUIRED", true, [pdfRows[0]], "EXACT_DOCUMENT_DUPLICATE");
  const nearDuplicate = { ...pdfRows[1], description: "Mantenimiento sintético - copia administrativa" };
  push(documentInput("doc-40", "possible-business-duplicate.pdf", "application/pdf", nativePdf(nearDuplicate)), "PDF_NATIVE", "REVIEW_REQUIRED", true, [nearDuplicate], "POSSIBLE_BUSINESS_DUPLICATE");

  return { documents: Object.freeze(documents), truth: Object.freeze(truth) };
}
