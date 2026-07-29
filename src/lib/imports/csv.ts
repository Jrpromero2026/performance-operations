/**
 * RFC 4180 CSV parser — dependency-free, server-side source of truth.
 * Handles UTF-8 BOM, quoted fields (embedded delimiters, newlines, escaped
 * quotes), delimiter auto-detection (, ; tab), ragged rows, duplicate
 * headers, and formula-injection flagging. Never evaluates cell content.
 */

export interface CsvParseIssue {
  code:
    | "ragged_row"
    | "duplicate_header"
    | "empty_header"
    | "unclosed_quote"
    | "row_limit_exceeded"
    | "empty_file";
  rowNumber?: number;
  message: string;
}

export interface CsvParseResult {
  headers: string[];
  /** Data rows (header excluded); each padded/truncated flagged via issues. */
  rows: string[][];
  delimiter: string;
  hadBom: boolean;
  issues: CsvParseIssue[];
}

export const MAX_IMPORT_ROWS = 10_000;

/** Detect the most plausible delimiter from the first non-empty line. */
export function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;
  for (const candidate of candidates) {
    // count occurrences outside quotes
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i++) {
      const ch = firstLine[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === candidate && !inQuotes) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

export function parseCsv(
  input: string,
  options: { maxRows?: number; delimiter?: string } = {}
): CsvParseResult {
  const issues: CsvParseIssue[] = [];
  let text = input;
  let hadBom = false;
  if (text.charCodeAt(0) === 0xfeff) {
    hadBom = true;
    text = text.slice(1);
  }

  if (text.trim().length === 0) {
    issues.push({ code: "empty_file", message: "The file contains no data." });
    return { headers: [], rows: [], delimiter: ",", hadBom, issues };
  }

  const delimiter = options.delimiter ?? detectDelimiter(text);
  const maxRows = options.maxRows ?? MAX_IMPORT_ROWS;

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    // skip fully empty trailing lines
    if (!(record.length === 1 && record[0] === "")) {
      records.push(record);
    }
    record = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      pushField();
      i++;
      continue;
    }
    if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      pushRecord();
      i++;
      continue;
    }
    if (ch === "\n") {
      pushRecord();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (inQuotes) {
    issues.push({
      code: "unclosed_quote",
      rowNumber: records.length + 1,
      message: "The file ends inside an unclosed quoted value.",
    });
  }
  if (field !== "" || record.length > 0) pushRecord();

  if (records.length === 0) {
    issues.push({ code: "empty_file", message: "The file contains no data rows." });
    return { headers: [], rows: [], delimiter, hadBom, issues };
  }

  const headers = records[0].map((h) => h ?? "");
  const seen = new Map<string, number>();
  headers.forEach((header, index) => {
    const key = header.trim().toLowerCase();
    if (key === "") {
      issues.push({
        code: "empty_header",
        rowNumber: 1,
        message: `Column ${index + 1} has an empty header.`,
      });
    } else if (seen.has(key)) {
      issues.push({
        code: "duplicate_header",
        rowNumber: 1,
        message: `Duplicate header "${header.trim()}" (columns ${seen.get(key)! + 1} and ${index + 1}).`,
      });
    } else {
      seen.set(key, index);
    }
  });

  const rows: string[][] = [];
  for (let r = 1; r < records.length; r++) {
    if (rows.length >= maxRows) {
      issues.push({
        code: "row_limit_exceeded",
        rowNumber: r + 1,
        message: `The file exceeds the ${maxRows.toLocaleString()}-row limit; remaining rows were not parsed.`,
      });
      break;
    }
    const rec = records[r];
    if (rec.length !== headers.length) {
      issues.push({
        code: "ragged_row",
        rowNumber: r + 1,
        message: `Row ${r + 1} has ${rec.length} values but the header has ${headers.length}.`,
      });
      // pad/truncate so downstream indexes stay aligned
      const fixed = [...rec];
      while (fixed.length < headers.length) fixed.push("");
      rows.push(fixed.slice(0, headers.length));
    } else {
      rows.push(rec);
    }
  }

  return { headers, rows, delimiter, hadBom, issues };
}

/** True when a cell would be interpreted as a formula by a spreadsheet. */
export function isFormulaLike(value: string): boolean {
  return /^[=+\-@\t\r]/.test(value) && !/^-?\d/.test(value);
}

/** Neutralize a cell for CSV export (formula-injection protection). */
export function escapeCsvCell(value: string): string {
  let out = value;
  if (isFormulaLike(out)) out = `'${out}`;
  if (/[",\n\r]/.test(out)) out = `"${out.replaceAll('"', '""')}"`;
  return out;
}

/** Convert a raw record to an object keyed by TRIMMED headers. */
export function rowToObject(headers: string[], row: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  headers.forEach((header, index) => {
    const key = header.trim();
    if (key !== "" && !(key in obj)) {
      obj[key] = row[index] ?? "";
    }
  });
  return obj;
}
