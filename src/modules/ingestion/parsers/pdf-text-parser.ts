import type { ParserAdapter, RawInvoiceRecord } from "../raw-record";
import { decodeLocalPdf } from "./local-pdf-decoder";

const FIELD_MAP: Record<string, string> = {
  NUMERO: "invoiceNumber", FECHA: "invoiceDate", VENCIMIENTO: "dueDate", IMPORTE: "amount",
  MONEDA: "currency", EMISOR: "issuer", FACTURADO_A: "billedParty", CUIT: "cuit",
  ADMINISTRACION: "administration", CONSORCIO: "building", DIRECCION: "address", CONCEPTO: "description",
};

export const PdfTextParser: ParserAdapter = {
  async parse(documentId, bytes) {
    const text = new TextDecoder().decode(bytes);
    const blocks = [...text.matchAll(/BT\s*\(([^)]*)\)\s*Tj\s*ET/g)].map((match) => match[1].replace(/\\([()\\])/g, "$1"));
    if (blocks.length === 0) return [await decodeLocalPdf(documentId, bytes)];
    const values: Record<string, string> = {};
    const evidence: Record<string, RawInvoiceRecord["evidence"][string]> = {};
    blocks.forEach((block, index) => {
      const separator = block.indexOf(":");
      if (separator < 0) return;
      const label = block.slice(0, separator).trim();
      const field = FIELD_MAP[label];
      if (!field) return;
      const raw = block.slice(separator + 1).trim();
      values[field] = values[field] ? `${values[field]}|${raw}` : raw;
      evidence[field] = { documentId, location: { kind: "PDF_TEXT", page: 1, textSpan: `block:${index + 1}` }, rawValue: values[field] };
    });
    return [{ values, evidence }];
  },
};
