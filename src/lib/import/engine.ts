import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type ExcelJS from "exceljs";
import type { FieldDefinition } from "@/db/schema";
import { normalizeValue, isEqualValue, displayValue, hasOptions } from "@/lib/fields";
import { callClaude, getActiveKey } from "@/lib/anthropic";
import { cellText, cellValue, normHeader, type Sheet } from "./excel";
import type { ColumnMap, ImportSkill, ParsedRow } from "./types";

/* ------------------------------ 表头匹配 ------------------------------ */

function matchHeader(header: string, fields: FieldDefinition[], taken: Set<string>): { f: FieldDefinition; how: ColumnMap["how"] } | null {
  const h = normHeader(header);
  if (!h) return null;
  const free = fields.filter((f) => !taken.has(f.key));
  for (const f of free) if (normHeader(f.label) === h) return { f, how: "exact" };
  for (const f of free) if (f.aliases.some((a) => normHeader(a) === h)) return { f, how: "alias" };
  // 模糊：表头以字段名开头（如「本案の留意点（タクシー事業・クロスボーダー）」）或以「／」分隔的任一部分相同
  const parts = header.split(/[／/]/).map(normHeader).filter((x) => x.length >= 2);
  for (const f of free) {
    const names = [f.label, ...f.aliases].map(normHeader).filter((x) => x.length >= 2);
    if (names.some((n) => h.startsWith(n) || n.startsWith(h) || parts.includes(n))) return { f, how: "fuzzy" };
  }
  return null;
}

function scoreRow(ws: Sheet, r: number, hints: string[]) {
  const row = ws.getRow(r);
  let n = 0;
  const H = hints.map(normHeader);
  row.eachCell((c) => {
    const t = normHeader(cellText(c));
    if (t && H.some((h) => t.includes(h))) n++;
  });
  return n;
}

export function pickSheet(wb: ExcelJS.Workbook, skill: ImportSkill) {
  for (const name of skill.preferredSheets) {
    const ws = wb.getWorksheet(name);
    if (ws) return ws;
  }
  let best: Sheet | undefined;
  let bestScore = 0;
  wb.eachSheet((ws) => {
    for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
      const s = scoreRow(ws, r, skill.headerHints);
      if (s > bestScore) { bestScore = s; best = ws; }
    }
  });
  if (!best || bestScore < 3) throw new Error(`未在文件中找到「${skill.title}」的表头，请确认上传的是正确的模板`);
  return best;
}

export function findHeaderRow(ws: Sheet, skill: ImportSkill) {
  let best = 0, bestScore = 0;
  for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
    const s = scoreRow(ws, r, skill.headerHints);
    if (s > bestScore) { bestScore = s; best = r; }
  }
  if (bestScore < 3) throw new Error("无法识别表头行");
  return best;
}

export function mapColumns(ws: Sheet, headerRow: number, fields: FieldDefinition[]) {
  const cols: ColumnMap[] = [];
  const taken = new Set<string>();
  const row = ws.getRow(headerRow);
  for (let c = 1; c <= ws.columnCount; c++) {
    const header = cellText(row.getCell(c)).replace(/\n/g, " ");
    if (!header) continue;
    const m = matchHeader(header, fields, taken);
    if (m) {
      taken.add(m.f.key);
      cols.push({ col: c, header, fieldKey: m.f.key, fieldLabel: m.f.label, how: m.f.formula ? "computed" : m.how });
    } else cols.push({ col: c, header, fieldKey: null, how: "none" });
  }
  return cols;
}

/** 表头无法确定性匹配时，调用 Claude（以 SKILL.md 为系统提示）做字段映射 */
export async function claudeMapColumns(skill: ImportSkill, cols: ColumnMap[], fields: FieldDefinition[]) {
  const unmapped = cols.filter((c) => !c.fieldKey);
  const taken = new Set(cols.map((c) => c.fieldKey).filter(Boolean));
  const freeFields = fields.filter((f) => !taken.has(f.key) && !f.formula);
  if (!unmapped.length || !freeFields.length) return false;
  if (!(await getActiveKey())) return false;
  let skillMd = "";
  try {
    skillMd = await fs.readFile(path.join(process.cwd(), "skills", skill.name, "SKILL.md"), "utf8");
  } catch {}
  const prompt = JSON.stringify({
    task: "把 Excel 中未匹配的表头映射到系统字段。只输出 JSON：{\"mappings\":[{\"col\":<列号>,\"fieldKey\":\"<字段key或null>\"}]}。不确定时给 null。",
    unmappedHeaders: unmapped.map((c) => ({ col: c.col, header: c.header })),
    availableFields: freeFields.map((f) => ({ key: f.key, label: f.label, type: f.type, aliases: f.aliases })),
  });
  const text = await callClaude({ system: skillMd || undefined, messages: [{ role: "user", content: prompt }], maxTokens: 1024 });
  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { mappings: { col: number; fieldKey: string | null }[] };
  let used = false;
  for (const m of json.mappings ?? []) {
    const c = cols.find((x) => x.col === m.col && !x.fieldKey);
    const f = freeFields.find((x) => x.key === m.fieldKey && !taken.has(x.key));
    if (c && f) {
      c.fieldKey = f.key;
      c.fieldLabel = f.label;
      c.how = "claude";
      taken.add(f.key);
      used = true;
    }
  }
  return used;
}

/* ------------------------------ 元数据 ------------------------------ */

export function readMeta(ws: Sheet, headerRow: number, skill: ImportSkill) {
  const meta: { startDate?: string | null } = {};
  for (const m of skill.meta ?? []) {
    for (let r = 1; r < headerRow; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= Math.min(ws.columnCount, 30); c++) {
        const t = cellText(row.getCell(c));
        if (t && m.labels.some((l) => t.includes(l))) {
          for (let k = c + 1; k <= c + 4; k++) {
            const v = cellValue(row.getCell(k));
            const d = normalizeValue("date", v);
            if (d) { meta[m.key] = d as string; break; }
          }
        }
      }
    }
  }
  return meta;
}

/* ------------------------------ 数据行 ------------------------------ */

export function readRows(ws: Sheet, headerRow: number, cols: ColumnMap[], fields: FieldDefinition[], skill: ImportSkill) {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const codeF = fields.find((f) => f.role === "code");
  const rows: ParsedRow[] = [];
  const warnings: string[] = [];
  const extra: Record<string, Record<string, unknown>> = {};
  let blanks = 0;
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const data: Record<string, unknown> = {};
    const unmappedVals: Record<string, unknown> = {};
    let any = false;
    for (const c of cols) {
      const cell = row.getCell(c.col);
      let v = cellValue(cell);
      if (v !== null && v !== "") any = true;
      if (!c.fieldKey) {
        if (v !== null && v !== "") unmappedVals[c.header] = v instanceof Date ? v.toISOString().slice(0, 10) : v;
        continue;
      }
      const f = byKey.get(c.fieldKey)!;
      if (f.formula) continue; // 计算列：由系统计算，忽略文件值
      const special = skill.cellRule?.(f.key, v, cell);
      if (special !== undefined) v = special;
      if (f.type === "percent" && typeof v === "number" && (cell.numFmt ?? "").includes("%")) v = Math.round(v * 1000) / 10;
      if (typeof v === "string") v = v.replace(/\r\n/g, "\n").trim();
      data[f.key] = normalizeValue(f.type, v);
    }
    if (!any) {
      if (++blanks >= 5) break;
      continue;
    }
    blanks = 0;
    if (skill.isDataRow && !skill.isDataRow(data)) continue;
    const code = codeF ? String(data[codeF.key] ?? "").trim() : "";
    if (!code) {
      warnings.push(`第 ${r} 行缺少编号，已跳过`);
      continue;
    }
    rows.push({ rowNo: r, code, data });
    if (Object.keys(unmappedVals).length) extra[code] = unmappedVals;
  }
  // 编号重复
  const seen = new Map<string, number>();
  const dedup: ParsedRow[] = [];
  for (const row of rows) {
    if (seen.has(row.code)) {
      warnings.push(`编号「${row.code}」在第 ${seen.get(row.code)} 行与第 ${row.rowNo} 行重复，仅保留第一条`);
      continue;
    }
    seen.set(row.code, row.rowNo);
    dedup.push(row);
  }
  return { rows: dedup, warnings, extra };
}

/* ------------------------------ 差异计算 ------------------------------ */

type Existing = { id: string; externalKey: string | null; data: Record<string, unknown> };

export function diffRows(
  fields: FieldDefinition[], parsed: ParsedRow[], existing: Existing[],
  opts: { mode: "merge" | "sync"; keepExistingOnEmpty: boolean; mappedKeys: Set<string> },
) {
  const byCode = new Map(existing.filter((e) => e.externalKey).map((e) => [e.externalKey!, e]));
  const titleF = fields.find((f) => f.role === "title");
  const creates: { code: string; data: Record<string, unknown> }[] = [];
  const updates: { itemId: string; code: string; patch: Record<string, unknown>; changes: { field: string; from: string; to: string }[] }[] = [];
  let unchanged = 0;
  const newOptions: Record<string, Set<string>> = {};
  for (const p of parsed) {
    for (const f of fields) {
      if (!hasOptions(f.type)) continue;
      const v = p.data[f.key];
      const vs = Array.isArray(v) ? v : v ? [v] : [];
      for (const x of vs) if (!f.options.includes(String(x))) (newOptions[f.key] ??= new Set()).add(String(x));
    }
    const ex = byCode.get(p.code);
    if (!ex) {
      creates.push({ code: p.code, data: p.data });
      continue;
    }
    const patch: Record<string, unknown> = {};
    const changes: { field: string; from: string; to: string }[] = [];
    for (const f of fields) {
      if (f.formula || !opts.mappedKeys.has(f.key)) continue;
      const nv = p.data[f.key] ?? null;
      if (nv === null && opts.keepExistingOnEmpty) continue;
      if (!isEqualValue(ex.data[f.key] ?? null, nv)) {
        patch[f.key] = nv;
        changes.push({ field: f.label, from: displayValue(f.type, ex.data[f.key]), to: displayValue(f.type, nv) });
      }
    }
    if (changes.length) updates.push({ itemId: ex.id, code: p.code, patch, changes });
    else unchanged++;
  }
  const codes = new Set(parsed.map((p) => p.code));
  const deletes =
    opts.mode === "sync"
      ? existing.filter((e) => !e.externalKey || !codes.has(e.externalKey)).map((e) => ({ itemId: e.id, code: e.externalKey ?? "（无编号）", title: titleF ? String(e.data[titleF.key] ?? "") : "" }))
      : [];
  return {
    creates, updates, deletes, unchanged,
    newOptions: Object.fromEntries(Object.entries(newOptions).map(([k, s]) => [k, [...s]])),
  };
}
