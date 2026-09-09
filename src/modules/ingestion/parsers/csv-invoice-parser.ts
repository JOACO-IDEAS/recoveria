import type { ParserAdapter, RawInvoiceRecord } from "../raw-record";

function parseRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"' && quoted && input[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(cell); if (row.some((value) => value.length > 0)) rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  row.push(cell); if (row.some((value) => value.length > 0)) rows.push(row);
  if (quoted) throw new Error("CSV_UNCLOSED_QUOTE");
  return rows;
}

export const CsvInvoiceParser: ParserAdapter = {
  async parse(documentId, bytes) {
    const rows = parseRows(new TextDecoder().decode(bytes));
    if (rows.length < 2) throw new Error("CSV_NO_DATA_ROWS");
    const headers = rows[0].map((value) => value.trim());
    return rows.slice(1).map((cells, rowIndex): RawInvoiceRecord => {
      const values: Record<string, string> = {}, evidence: Record<string, RawInvoiceRecord["evidence"][string]> = {};
      headers.forEach((header, columnIndex) => {
        const raw = cells[columnIndex]?.trim() ?? "";
        values[header] = raw;
        evidence[header] = { documentId, location: { kind: "CSV_CELL", row: rowIndex + 2, column: String(columnIndex + 1) }, rawValue: raw };
      });
      return { values, evidence };
    });
  },
};
