import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BlindVerificationInput, DocumentaryRole, IndependentDocumentVerification, IndependentFieldObservation, ObservationConfidence, VerificationFieldName } from "./independent-verification-types";

const execFileAsync = promisify(execFile);
const MONTHS = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";
const DATE = /\b(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})\b/;
const MONEY = /(?:\$|ARS|PESOS?)?\s*([0-9]{1,3}(?:[.\s][0-9]{3})*(?:,[0-9]{2})|[0-9]+(?:[.,][0-9]{2}))/i;

interface OCRLine { readonly page: number; readonly text: string; readonly confidence: number; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
interface OCRDocument { readonly provider: string; readonly providerVersion: string; readonly pageCount: number; readonly lines: readonly OCRLine[] }

function fold(value: string): string { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
function confidence(value: number): ObservationConfidence { return value >= 0.85 ? "HIGH" : value >= 0.65 ? "MEDIUM" : "LOW"; }
function box(line: OCRLine) { return { x: line.x, y: line.y, width: line.width, height: line.height }; }
function absent(role: DocumentaryRole): IndependentFieldObservation { return { status: "NOT_FOUND", normalizedValue: null, rawObservedValue: null, role, confidence: "HIGH", page: null, evidence: { extractionMethod: "APPLE_VISION_OCR", text: null, boundingBox: null } }; }
function ambiguous(role: DocumentaryRole, line?: OCRLine): IndependentFieldObservation { return { status: "AMBIGUOUS", normalizedValue: null, rawObservedValue: line?.text ?? null, role, confidence: line ? confidence(line.confidence) : "LOW", page: line?.page ?? null, evidence: { extractionMethod: "APPLE_VISION_OCR", text: line?.text ?? null, boundingBox: line ? box(line) : null } }; }
function found(role: DocumentaryRole, normalizedValue: string, rawObservedValue: string, line: OCRLine, confidenceOverride?: ObservationConfidence): IndependentFieldObservation { return { status: "FOUND", normalizedValue, rawObservedValue, role, confidence: confidenceOverride ?? confidence(line.confidence), page: line.page, evidence: { extractionMethod: "APPLE_VISION_OCR", text: line.text, boundingBox: box(line) } }; }
function labelled(lines: readonly OCRLine[], labels: readonly RegExp[], exclusions: readonly RegExp[] = []): OCRLine[] { return lines.filter((line) => labels.some((label) => label.test(fold(line.text))) && !exclusions.some((exclude) => exclude.test(fold(line.text)))); }
function lineAndNext(lines: readonly OCRLine[], index: number): OCRLine { const current = lines[index]!; const next = lines[index + 1]; return next && next.page === current.page && Math.abs(next.y - current.y) < 0.06 ? { ...current, text: `${current.text} ${next.text}`, confidence: Math.min(current.confidence, next.confidence) } : current; }
function unique<T>(items: readonly T[], key: (item: T) => string): T[] { const result: T[] = []; const seen = new Set<string>(); for (const item of items) { const value = key(item); if (!seen.has(value)) { seen.add(value); result.push(item); } } return result; }
function mergeVisualRows(lines: readonly OCRLine[]): OCRLine[] {
  const rows: OCRLine[][] = [];
  for (const line of [...lines].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)) {
    const row = rows.find((candidate) => candidate[0]!.page === line.page && Math.abs(candidate[0]!.y - line.y) <= Math.max(0.008, Math.min(candidate[0]!.height, line.height) * 0.55));
    if (row) row.push(line); else rows.push([line]);
  }
  return rows.map((row) => { const ordered = row.sort((a, b) => a.x - b.x); const first = ordered[0]!; const right = Math.max(...ordered.map((item) => item.x + item.width)); const bottom = Math.min(...ordered.map((item) => item.y)); const top = Math.max(...ordered.map((item) => item.y + item.height)); return { page: first.page, text: ordered.map((item) => item.text).join(" "), confidence: Math.min(...ordered.map((item) => item.confidence)), x: first.x, y: bottom, width: right - first.x, height: top - bottom }; });
}

function normalizeDate(value: string): string | null { const match = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(value.trim()); if (!match) return null; const year = match[3]!.length === 2 ? `20${match[3]}` : match[3]!; const day = Number(match[1]), month = Number(match[2]); if (day < 1 || day > 31 || month < 1 || month > 12) return null; return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`; }
function normalizeMoney(value: string): string | null { const cleaned = value.replace(/[^0-9.,]/g, ""); if (!cleaned) return null; const comma = cleaned.lastIndexOf(","), dot = cleaned.lastIndexOf("."); let decimal = "", integer = cleaned; if (comma > dot && cleaned.length - comma === 3) { decimal = cleaned.slice(comma + 1); integer = cleaned.slice(0, comma); } else if (dot > comma && cleaned.length - dot === 3 && comma < 0) { decimal = cleaned.slice(dot + 1); integer = cleaned.slice(0, dot); } integer = integer.replace(/[.,]/g, ""); if (!/^\d+$/.test(integer) || (decimal && !/^\d{2}$/.test(decimal))) return null; return `${BigInt(integer)}.${decimal || "00"}`; }

function observeDate(lines: readonly OCRLine[], role: "ISSUE_DATE" | "PAYMENT_DUE_DATE"): IndependentFieldObservation {
  const isDue = role === "PAYMENT_DUE_DATE";
  const candidates = labelled(lines, isDue ? [/\b(fecha de )?vencimiento\b/, /\bvenc(e|\.)\b/, /\bpago hasta\b/] : [/\bfecha\s*:/, /fecha de emision/, /fecha emision/], isDue ? [/\bcae\b/, /\bcai\b/, /autoriz/] : [/venc/, /\bcae\b/, /\bcai\b/, /servicio/, /periodo/]);
  const dated = unique(candidates.flatMap((line) => { const match = DATE.exec(line.text); const normalized = match ? normalizeDate(match[1]!) : null; return normalized ? [{ line, raw: match![1]!, normalized }] : []; }), (item) => item.normalized);
  if (dated.length === 0) return absent(role);
  if (dated.length > 1) return ambiguous(role, dated[0]!.line);
  const item = dated[0]!; return found(role, item.normalized, item.raw, item.line);
}

function observeInvoiceNumber(lines: readonly OCRLine[]): IndependentFieldObservation {
  const candidates = unique(lines.flatMap((line, index) => {
    const combined = lineAndNext(lines, index); const text = combined.text;
    const patterns = [/(?:comp\.?\s*nro\.?|comprobante\s*(?:nro\.?|n[uú]mero)|factura\s*(?:nro\.?|n[uú]mero))\s*[:#-]?\s*([0-9]{3,5}\s*[-–]\s*[0-9]{6,10})/i, /(?:punto de venta|pto\.?\s*vta\.?)\s*[:#-]?\s*([0-9]{3,5}).*?(?:comp\.?\s*nro\.?|n[uú]mero)\s*[:#-]?\s*([0-9]{6,10})/i, /(?:codigo|c[oó]digo)\s*(?:nro\.?|n[uú]mero)?\s*[:#-]?\s*([0-9]{3,5})\s*[-–]\s*([0-9]{6,10})/i];
    for (const pattern of patterns) { const match = pattern.exec(text); if (match) { const raw = match[2] ? `${match[1]}-${match[2]}` : match[1]!; return [{ line: combined, raw, normalized: raw.replace(/\s/g, "").replace(/[–]/g, "-") }]; } }
    return [];
  }), (item) => item.normalized);
  if (candidates.length === 0) return absent("INVOICE_NUMBER"); if (candidates.length > 1) return ambiguous("INVOICE_NUMBER", candidates[0]!.line); const item = candidates[0]!; return found("INVOICE_NUMBER", item.normalized, item.raw, item.line);
}

function observeAmount(lines: readonly OCRLine[]): IndependentFieldObservation {
  const totalLines = labelled(lines, [/\bimporte total\b/, /^total\b/, /\btotal[: ]/], [/subtotal/, /iva/, /tribut/]);
  const candidates = unique(totalLines.flatMap((line) => { const matches = [...line.text.matchAll(new RegExp(MONEY.source, "gi"))]; const last = matches.at(-1); const raw = last?.[0]?.trim(); const normalized = raw ? normalizeMoney(raw) : null; return raw && normalized ? [{ line, raw, normalized }] : []; }), (item) => item.normalized);
  if (candidates.length === 0) return absent("NOMINAL_AMOUNT"); if (candidates.length > 1) return ambiguous("NOMINAL_AMOUNT", candidates.at(-1)!.line); const item = candidates[0]!; return found("NOMINAL_AMOUNT", item.normalized, item.raw, item.line);
}

function observeCurrency(lines: readonly OCRLine[]): IndependentFieldObservation {
  const explicit = lines.filter((line) => /\b(ars|peso argentino|pesos argentinos|moneda\s*:\s*pesos?)\b/i.test(fold(line.text)));
  if (explicit.length) return found("CURRENCY", "ARS", explicit[0]!.text, explicit[0]!);
  const symbol = lines.find((line) => /\$\s*[0-9]/.test(line.text));
  return symbol ? ambiguous("CURRENCY", symbol) : absent("CURRENCY");
}

function observeExplicitRole(lines: readonly OCRLine[], role: "ISSUER" | "BILLED_CUSTOMER" | "ADMINISTRATION", labels: readonly RegExp[]): IndependentFieldObservation {
  const candidates = unique(lines.flatMap((line, index) => { const normalizedLine = fold(line.text); const label = labels.find((item) => item.test(normalizedLine)); if (!label) return []; const combined = lineAndNext(lines, index); const colon = combined.text.indexOf(":"); const raw = (colon >= 0 ? combined.text.slice(colon + 1) : combined.text).trim(); return raw.length >= 3 ? [{ line: combined, raw }] : []; }), (item) => fold(item.raw));
  if (candidates.length === 0) return absent(role); if (candidates.length > 1) return ambiguous(role, candidates[0]!.line); const item = candidates[0]!; return found(role, fold(item.raw), item.raw, item.line, "HIGH");
}

function observeIssuer(lines: readonly OCRLine[]): IndependentFieldObservation {
  const legalName = unique(lines.filter((line) => line.y > 0.55 && /\b(s\.?r\.?l\.?|s\.?a\.?s?\.?|sociedad anonima|sociedad de responsabilidad limitada)\b/i.test(fold(line.text))), (line) => fold(line.text));
  if (legalName.length === 0) return absent("ISSUER");
  const normalized = legalName.map((line) => ({ line, value: fold(line.text) }));
  const canonical = normalized.find((candidate) => normalized.every((other) => other.value.includes(candidate.value) || candidate.value.includes(other.value)));
  if (!canonical) return ambiguous("ISSUER", legalName[0]);
  return found("ISSUER", canonical.value, canonical.line.text, canonical.line, "HIGH");
}

function observeBuilding(lines: readonly OCRLine[], customer: IndependentFieldObservation): IndependentFieldObservation {
  if (customer.status === "FOUND" && /\b(consorcio|edificio)\b/i.test(customer.rawObservedValue ?? "")) return { ...customer, role: "BUILDING" };
  const explicit = observeExplicitRole(lines, "ADMINISTRATION", [/\bconsorcio\s*:/, /\bedificio\s*:/]);
  return { ...explicit, role: "BUILDING" };
}

function observeServicePeriod(lines: readonly OCRLine[]): IndependentFieldObservation {
  const regex = new RegExp(`\\b(${MONTHS})\\s+(?:de\\s+)?(20\\d{2})\\b`, "i");
  const monthNumber: Readonly<Record<string, number>> = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
  const candidates = unique(lines.flatMap((line) => { const match = regex.exec(fold(line.text)); if (!match) return []; const raw = match[0]; const month = monthNumber[match[1]!]; return month ? [{ line, raw, normalized: `${match[2]}-${String(month).padStart(2, "0")}` }] : []; }), (item) => item.normalized);
  if (candidates.length === 0) return absent("SERVICE_PERIOD"); if (candidates.length > 1) return ambiguous("SERVICE_PERIOD", candidates[0]!.line); const item = candidates[0]!; return found("SERVICE_PERIOD", item.normalized, item.raw, item.line);
}

export function interpretVisionOCR(document: OCRDocument, input: BlindVerificationInput, now: () => string = () => new Date().toISOString()): IndependentDocumentVerification {
  if (document.provider !== "APPLE_VISION_OCR" || document.pageCount < 1) throw new Error("INDEPENDENT_VERIFIER_OUTPUT_INVALID");
  const lines = mergeVisualRows(document.lines.filter((line) => line.page >= 1 && line.page <= document.pageCount && line.text.trim() !== ""));
  const customer = observeExplicitRole(lines, "BILLED_CUSTOMER", [/apellido y nombre\s*\/\s*razon social/, /razon social del receptor/, /razon social\s*:/, /cliente\s*:/, /senor(?:es)?\s*:/]);
  const fields: Record<VerificationFieldName, IndependentFieldObservation> = {
    invoiceNumber: observeInvoiceNumber(lines),
    issueDate: observeDate(lines, "ISSUE_DATE"),
    documentedDueDate: observeDate(lines, "PAYMENT_DUE_DATE"),
    nominalAmount: observeAmount(lines),
    currency: observeCurrency(lines),
    issuer: observeIssuer(lines),
    billedCustomer: customer,
    administration: observeExplicitRole(lines, "ADMINISTRATION", [/administracion\s*:/, /administrador(?:a)?\s*:/]),
    building: observeBuilding(lines, customer),
    servicePeriod: observeServicePeriod(lines),
  };
  return { documentId: input.documentId, inputSha256: input.sha256, pageCount: document.pageCount, verifier: { provider: "APPLE_VISION_OCR", version: document.providerVersion }, observedAt: now(), fields };
}

export async function verifyPdfBlindly(input: BlindVerificationInput, swiftScriptPath: string): Promise<IndependentDocumentVerification> {
  const { stdout, stderr } = await execFileAsync("/usr/bin/swift", [swiftScriptPath, input.pdfPath], { maxBuffer: 16 * 1024 * 1024, timeout: 120_000 });
  const unexpectedStderr = stderr.split("\n").map((line) => line.trim()).filter(Boolean).filter((line) => line !== "CoreGraphics PDF has logged an error. Set environment variable \"CG_PDF_VERBOSE\" to learn more.");
  if (unexpectedStderr.length) throw new Error("INDEPENDENT_VERIFIER_STDERR_REJECTED");
  return interpretVisionOCR(JSON.parse(stdout) as OCRDocument, input);
}
