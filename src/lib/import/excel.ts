import "server-only";
import ExcelJS from "exceljs";

export type Cell = ExcelJS.Cell;
export type Sheet = ExcelJS.Worksheet;

export async function loadWorkbook(buf: ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  return wb;
}

/** 取单元格“显示值”：公式取缓存结果，富文本拼接，超链接取文字 */
export function cellValue(c: Cell | undefined): unknown {
  if (!c) return null;
  const v = c.value as unknown;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return o.result instanceof Date || typeof o.result !== "object" ? (o.result ?? null) : null;
    if ("formula" in o || "sharedFormula" in o) return null;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return String(o.text);
    if ("error" in o) return null;
    return null;
  }
  return v;
}

export function cellText(c: Cell | undefined): string {
  const v = cellValue(c);
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

export function isFormula(c: Cell | undefined) {
  const v = c?.value as unknown;
  return !!v && typeof v === "object" && ("formula" in (v as object) || "sharedFormula" in (v as object));
}

export function fillColor(c: Cell | undefined): string | null {
  const f = c?.fill as { type?: string; fgColor?: { argb?: string } } | undefined;
  if (!f || f.type !== "pattern") return null;
  return f.fgColor?.argb?.toUpperCase() ?? null;
}

/** 表头规范化：全角转半角、去空白与换行、小写 */
export function normHeader(s: string) {
  return s.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}
