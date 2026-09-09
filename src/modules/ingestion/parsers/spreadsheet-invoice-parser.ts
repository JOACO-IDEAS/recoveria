import ExcelJS from "exceljs";
import type { ParserAdapter, RawInvoiceRecord } from "../raw-record";

export const SpreadsheetInvoiceParser: ParserAdapter = {
  async parse(documentId, bytes) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as never);
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount < 2) throw new Error("XLSX_NO_DATA_ROWS");
    const headers = (sheet.getRow(1).values as unknown[]).slice(1).map(String);
    const records: RawInvoiceRecord[] = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      if (!row.hasValues) continue;
      const values: Record<string, string> = {}, evidence: Record<string, RawInvoiceRecord["evidence"][string]> = {};
      headers.forEach((header, index) => {
        const raw = row.getCell(index + 1).text.trim();
        values[header] = raw;
        evidence[header] = { documentId, location: { kind: "SHEET_CELL", row: rowNumber, column: row.getCell(index + 1).address.replace(/\d/g, "") }, rawValue: raw };
      });
      records.push({ values, evidence });
    }
    return records;
  },
};
