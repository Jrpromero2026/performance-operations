/**
 * Excel workbook ingestion. SERVER ONLY.
 *
 * Setmore's export downloads as .xlsx, and for two months the operator
 * had to convert it to CSV by hand before uploading — machinery showing
 * through. This module removes that step: an uploaded workbook's first
 * sheet is read server-side into the SAME CSV text the rest of the
 * pipeline already consumes, so parsing, adapter detection, staging,
 * matching, and idempotency behave identically for both formats.
 *
 * Faithfulness rules, matched to how the CSV conversions were validated
 * against real exports:
 *  - Strings pass through verbatim (Setmore stores dates/times as text).
 *  - Whole numbers render without a decimal point; fractional numbers at
 *    two decimals with trailing zeros trimmed ("80.75", "45", "106.5").
 *  - Empty cells are "", fully empty rows are skipped.
 *  - Anything unexpected (rich text, formula results, real Date cells)
 *    degrades to its text rendering rather than failing the upload.
 *
 * The ORIGINAL workbook bytes are preserved unmodified as the batch's
 * evidence file; only the parsed representation flows onward.
 */

import ExcelJS from "exceljs";

/** ZIP local-file magic — every .xlsx (and any renamed one) starts with it. */
export function looksLikeZip(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
  );
}

/** Legacy .xls (OLE compound file) — not supported; detected for a clear message. */
export function looksLikeLegacyXls(buffer: Buffer): boolean {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  );
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    const fixed = value.toFixed(2);
    return fixed.replace(/0+$/, "").replace(/\.$/, "");
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) {
    // Setmore stores dates as text; a real Date cell would be a format
    // change. Render unambiguously and let the adapter's validation
    // surface it as an invalid_date issue rather than guessing.
    return value.toISOString();
  }
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? "").join("");
    }
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("error" in value) return "";
  }
  return String(value);
}

function escapeCsv(field: string): string {
  if (/[",\r\n]/.test(field)) return `"${field.replaceAll('"', '""')}"`;
  return field;
}

export interface WorkbookConversion {
  csvText: string;
  rowCount: number;
  sheetName: string;
}

/**
 * First sheet of an .xlsx buffer → CSV text in the pipeline's dialect.
 * Throws on an unreadable workbook; the caller translates that into an
 * operator-facing message.
 */
export async function workbookToCsvText(buffer: Buffer): Promise<WorkbookConversion> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("workbook_has_no_sheets");

  const lines: string[] = [];
  let columnCount = 0;
  let dataRows = 0;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    // row.values is 1-indexed with a sparse leading slot.
    const raw = row.values as ExcelJS.CellValue[];
    const cells: string[] = [];
    for (let i = 1; i < raw.length; i++) cells.push(cellText(raw[i]));
    if (rowNumber === 1) {
      columnCount = cells.length;
    } else {
      // Pad/trim to the header width so ragged rows stay aligned.
      while (cells.length < columnCount) cells.push("");
      cells.length = columnCount;
      if (cells.every((c) => c.trim() === "")) return;
      dataRows++;
    }
    lines.push(cells.map(escapeCsv).join(","));
  });

  if (lines.length === 0) throw new Error("workbook_first_sheet_empty");
  return {
    csvText: lines.join("\r\n") + "\r\n",
    rowCount: dataRows,
    sheetName: sheet.name,
  };
}
