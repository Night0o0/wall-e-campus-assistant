import ExcelJS from "exceljs";

/**
 * Writing real .xlsx files.
 *
 * A genuine workbook, produced by ExcelJS — not a CSV with the extension
 * changed. Excel opens a renamed CSV, which is why the trick survives so long,
 * but it carries no column widths, no header formatting, no cell types and no
 * percentage formatting, and it corrupts any value containing a comma or an
 * Arabic name with a quote in it.
 */

export type CellValue = string | number | null;

export interface SheetColumn {
  header: string;
  /** Width in characters. */
  width: number;
  /** Excel number format, e.g. "0.0%" — applied to the whole data column. */
  numberFormat?: string;
}

export interface SheetDefinition {
  /** Excel forbids : \ / ? * [ ] in sheet names and caps them at 31 characters. */
  name: string;
  columns: SheetColumn[];
  rows: CellValue[][];
  /** Rendered above the table, one line each, as context for whoever opens it. */
  notes?: string[];
}

const INVALID_SHEET_CHARS = /[:\\/?*[\]]/g;

export const toSheetName = (value: string) =>
  value.replace(INVALID_SHEET_CHARS, " ").trim().slice(0, 31) || "Sheet1";

export const buildWorkbook = async (
  sheet: SheetDefinition
): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "WALL-E Campus Assistant";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(toSheetName(sheet.name));

  const notes = sheet.notes ?? [];

  for (const note of notes) {
    const row = worksheet.addRow([note]);
    row.font = { italic: true, color: { argb: "FF6B7280" } };
  }

  if (notes.length > 0) {
    worksheet.addRow([]);
  }

  const headerRow = worksheet.addRow(sheet.columns.map((column) => column.header));

  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.alignment = { vertical: "middle" };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F2937" },
    };
  });

  for (const row of sheet.rows) {
    worksheet.addRow(row);
  }

  sheet.columns.forEach((column, index) => {
    const worksheetColumn = worksheet.getColumn(index + 1);
    worksheetColumn.width = column.width;

    if (column.numberFormat) {
      worksheetColumn.numFmt = column.numberFormat;
    }
  });

  // Freeze everything above the first data row, so the headers stay put while
  // a long roster is scrolled.
  worksheet.views = [{ state: "frozen", ySplit: headerRow.number }];

  // Filter buttons across the header, so the roster can be sorted by section
  // or attendance in Excel without touching the API.
  if (sheet.rows.length > 0) {
    worksheet.autoFilter = {
      from: { row: headerRow.number, column: 1 },
      to: { row: headerRow.number + sheet.rows.length, column: sheet.columns.length },
    };
  }

  // ExcelJS types this as its own Buffer interface; it is a Node Buffer.
  return (await workbook.xlsx.writeBuffer()) as Buffer;
};

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * "Electronics" + 2026-08-09 → "electronics_students_2026-08-09.xlsx".
 *
 * ASCII-only and punctuation-free: the name travels in a Content-Disposition
 * header, and a browser that meets a comma or a non-Latin character there can
 * truncate the download or save it under a mangled name.
 */
export const toExportFilename = (subject: string, kind: string, date: string) => {
  const slug =
    subject
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "course";

  return `${slug}_${kind}_${date}.xlsx`;
};

/** Today on the campus clock, as YYYY-MM-DD. en-CA formats dates that way. */
export const todayInZone = (timeZone: string, now: Date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
