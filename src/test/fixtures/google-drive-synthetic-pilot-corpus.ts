import { createHash } from "node:crypto";

export interface SyntheticDrivePilotFile {
  readonly id: string;
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly invoiceSeries: "SYN-A" | "SYN-B";
  readonly customerKey: string;
  readonly invoiceDate: string;
  readonly nominalTotal: string;
  readonly exactDuplicateOf?: string;
}

const CUSTOMERS = [
  { key: "ALFA", name: "Entidad Sintetica Alfa", taxId: "00-00000001-0", address: "Calle Simulada 101" },
  { key: "BETA", name: "Entidad Sintetica Beta", taxId: "00-00000002-0", address: "Calle Simulada 202" },
  { key: "GAMMA", name: "Entidad Sintetica Gamma", taxId: "00-00000003-0", address: "Calle Simulada 303" },
  { key: "DELTA", name: "Entidad Sintetica Delta", taxId: "00-00000004-0", address: "Calle Simulada 404" },
  { key: "EPSILON", name: "Entidad Sintetica Epsilon", taxId: "00-00000005-0", address: "Calle Simulada 505" },
] as const;

function escapePdf(value: string): string { return value.replace(/([()\\])/g, "\\$1"); }

function pdf(lines: readonly string[]): Uint8Array {
  const commands = lines.map((line, index) => `BT /F1 10 Tf 40 ${800 - index * 22} Td (${escapePdf(line)}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 840] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let value = "%PDF-1.4\n% RecoverIA synthetic Drive pilot fixture\n";
  const offsets = [0];
  objects.forEach((body, index) => { offsets.push(Buffer.byteLength(value)); value += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(value);
  value += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(value);
}

function uniqueFile(index: number, revision = "BASE"): SyntheticDrivePilotFile {
  const customer = CUSTOMERS[index % CUSTOMERS.length]!;
  const series = index < 20 ? "SYN-A" : "SYN-B";
  const sequence = String((index % 20) + 1).padStart(4, "0");
  const month = String((index % 6) + 1).padStart(2, "0");
  const invoiceDate = `15/${month}/2026`;
  const total = `${100_000 + index * 7_500},00`;
  const id = `synthetic-drive-${String(index + 1).padStart(3, "0")}`;
  return {
    id,
    fileName: `${series.toLowerCase()}-${sequence}-${customer.key.toLowerCase()}.pdf`,
    invoiceSeries: series,
    customerKey: customer.key,
    invoiceDate,
    nominalTotal: total,
    bytes: pdf([
      "FACTURA B SINTETICA - SIN VALOR FISCAL",
      `Nro: ${series === "SYN-A" ? "0007" : "0008"}-${sequence.padStart(8, "0")}`,
      `Fecha: ${invoiceDate}`,
      `Vencimiento: 28/${month}/2026`,
      "CUIT: 00-00000000-0",
      `Razon Social: ${customer.name}`,
      `CUIT: ${customer.taxId}`,
      `Domicilio: ${customer.address}`,
      "Moneda: Peso",
      `Servicio sintetico recurrente ${month}/2026 ${revision}`,
      ...(index % 10 === 0 ? ["CUOTA 1 DE 2"] : []),
      ...(index % 7 === 0 ? ["Presupuesto de fecha 01/01/2026"] : []),
      `TOTAL ${total.replace(",", ".")}`,
    ]),
  };
}

export function buildSyntheticDrivePilotCorpus(): readonly SyntheticDrivePilotFile[] {
  const unique = Array.from({ length: 39 }, (_, index) => uniqueFile(index));
  const original = unique[0]!;
  const duplicate: SyntheticDrivePilotFile = {
    ...original,
    id: "synthetic-drive-040",
    fileName: "duplicado-exacto-origen-distinto.pdf",
    exactDuplicateOf: original.id,
  };
  return Object.freeze([...unique, duplicate]);
}

export function changedSyntheticDrivePilotFile(file: SyntheticDrivePilotFile): SyntheticDrivePilotFile {
  const index = Number(file.id.split("-").at(-1)) - 1;
  if (!Number.isSafeInteger(index) || index < 0 || index >= 39) throw new Error("SYNTHETIC_DRIVE_FILE_NOT_CHANGEABLE");
  return { ...uniqueFile(index, "REVISION-2"), id: file.id, fileName: file.fileName };
}

export function syntheticDrivePilotManifest(files: readonly SyntheticDrivePilotFile[]) {
  return files.map(file => ({
    sourceId: file.id,
    fileName: file.fileName,
    sha256: createHash("sha256").update(file.bytes).digest("hex"),
    bytes: file.bytes.byteLength,
    invoiceSeries: file.invoiceSeries,
    customerKey: file.customerKey,
    invoiceDate: file.invoiceDate,
    nominalTotal: file.nominalTotal,
    ...(file.exactDuplicateOf ? { exactDuplicateOf: file.exactDuplicateOf } : {}),
  }));
}
