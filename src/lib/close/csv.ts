/**
 * Close-export CSV utilities: deterministic column order, UTF-8, CRLF,
 * formula-injection protection, and hashing. Integer cents come from the
 * source; presentation columns format US currency explicitly — one place,
 * shared by every accounting export.
 */

import { formatCents } from "@/lib/money/money";
import { sha256Hex } from "./manifest";

/**
 * Escape one CSV cell. Values starting with = + - @ (or tab/CR) are
 * prefixed with a single quote so spreadsheet apps never execute them
 * (formula-injection protection); quoting/escaping per RFC 4180.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export interface CsvDocument {
  content: string;
  rowCount: number;
  sha256: string;
  byteSize: number;
}

/** Build a CSV document (header rows + data rows) with hash + byte size. */
export function buildCsvDocument(
  headerLines: (string | number | null)[][],
  columns: string[],
  rows: (string | number | null)[][],
): CsvDocument {
  const lines: string[] = [];
  for (const header of headerLines) {
    lines.push(header.map(csvCell).join(","));
  }
  if (headerLines.length > 0) lines.push("");
  lines.push(columns.map(csvCell).join(","));
  for (const row of rows) {
    lines.push(row.map(csvCell).join(","));
  }
  const content = lines.join("\r\n") + "\r\n";
  return {
    content,
    rowCount: rows.length,
    sha256: sha256Hex(content),
    byteSize: Buffer.byteLength(content, "utf8"),
  };
}

/** US currency presentation for display columns (integer cents in, $ out). */
export function usd(cents: number | null): string {
  return cents === null ? "" : formatCents(cents);
}
