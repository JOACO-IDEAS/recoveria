import type { Classification, DocumentInput } from "./types";

const decoder = new TextDecoder("latin1");

export function classifyDocument(document: DocumentInput): Classification {
  const header = decoder.decode(document.bytes.slice(0, 4096));
  const tail = decoder.decode(document.bytes.slice(Math.max(0, document.bytes.length - 4096)));
  const extension = document.fileName.toLowerCase().split(".").pop();
  if (header.startsWith("%PDF-")) {
    if (!tail.includes("%%EOF")) return { format: "MALFORMED", evidence: ["PDF signature present but EOF marker missing"] };
    if (/RECOVERIA_SCAN_ONLY/.test(header)) {
      return { format: "PDF_SCANNED", evidence: ["Explicit synthetic scan-only marker; offline OCR routing required"] };
    }
    return { format: "PDF_NATIVE", evidence: ["Valid PDF container; local native-text decoding required"] };
  }
  if (document.bytes[0] === 0x50 && document.bytes[1] === 0x4b && (extension === "xlsx" || document.declaredMediaType.includes("spreadsheet"))) {
    return { format: "XLSX", evidence: ["ZIP signature plus XLSX extension/media type"] };
  }
  if (extension === "csv" || document.declaredMediaType === "text/csv") {
    return { format: "CSV", evidence: ["CSV extension/media type"] };
  }
  return { format: "UNSUPPORTED", evidence: [`Unsupported signature/type: ${document.declaredMediaType}`] };
}
