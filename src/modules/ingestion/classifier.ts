import type { Classification, DocumentInput } from "./types";

const decoder = new TextDecoder("latin1");

export function classifyDocument(document: DocumentInput): Classification {
  const header = decoder.decode(document.bytes.slice(0, 4096));
  const extension = document.fileName.toLowerCase().split(".").pop();
  if (header.startsWith("%PDF-")) {
    if (!header.includes("%%EOF")) return { format: "MALFORMED", evidence: ["PDF signature present but EOF marker missing"] };
    if (/\/Subtype\s*\/Image|RECOVERIA_SCAN_ONLY/.test(header) && !/\bBT\b[\s\S]*\bET\b/.test(header)) {
      return { format: "PDF_SCANNED", evidence: ["PDF has image/scan marker and no usable native text operators"] };
    }
    if (/\bBT\b[\s\S]*\bET\b/.test(header)) return { format: "PDF_NATIVE", evidence: ["PDF signature and native text operators found"] };
    return { format: "MALFORMED", evidence: ["PDF contains neither native text nor a supported scan marker"] };
  }
  if (document.bytes[0] === 0x50 && document.bytes[1] === 0x4b && (extension === "xlsx" || document.declaredMediaType.includes("spreadsheet"))) {
    return { format: "XLSX", evidence: ["ZIP signature plus XLSX extension/media type"] };
  }
  if (extension === "csv" || document.declaredMediaType === "text/csv") {
    return { format: "CSV", evidence: ["CSV extension/media type"] };
  }
  return { format: "UNSUPPORTED", evidence: [`Unsupported signature/type: ${document.declaredMediaType}`] };
}
