import "server-only";
import ExcelJS from "exceljs";
import { hasOptions } from "@/lib/fields";
import { statusKind } from "@/lib/status";
import { trackerSummary, groupStats, fieldByRole, type GroupRow } from "@/lib/tracker-stats";
import { fmtDateTime } from "@/lib/format";
import { FORMULAS } from "@/lib/formulas";
import { getLevelParents, levelDepthMap } from "@/lib/hierarchy";
import { MODULE_TITLE, type ExportData } from "./data";

// 品牌色（ARGB）
const C = { green: "FF275642", pine: "FF16362A", mid: "FF3F6E58", sage: "FF7C9A8B", mist: "FFD7E0DA", paper: "FFFAF8F4", white: "FFFFFFFF", danger: "FFB5563F" };
const FONT = "Microsoft YaHei";
const thin = { style: "thin" as const, color: { argb: "FFD7E0DA" } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

const statusFont: Record<string, string> = { done: C.green, progress: C.mid, partial: "FFB08A3E", hold: "FFB08A3E", excluded: "FF9AA59F", todo: "FF5B6B63", empty: "FF5B6B63" };

export async function buildXlsx(d: ExportData, actor: string) {
  const T = MODULE_TITLE[d.moduleKey];
  const wb = new ExcelJS.Workbook();
  wb.creator = "SOLYN FA MASTER";
  wb.created = new Date();
  const fields = d.fields;
  const statusF = fieldByRole(fields, "status");
  const levelF = d.moduleKey === "fa" ? fieldByRole(fields, "priority") : undefined;

  /* ---------------- Sheet 1: 跟踪表 ---------------- */
  const ws = wb.addWorksheet(T.zh.replace(/\s/g, ""), { views: [{ state: "frozen", ySplit: 3, xSplit: 2 }] });
  const lists = wb.addWorksheet("_lists", { state: "veryHidden" });
  const cols = [...fields.map((f) => ({ label: f.label, width: Math.max(8, Math.round(f.width / 7)) })), { label: "最后更新时间", width: 18 }, { label: "最后更新人", width: 12 }];
  ws.columns = cols.map((c) => ({ width: c.width }));
  const lastCol = cols.length;

  ws.mergeCells(1, 1, 1, lastCol);
  const t = ws.getCell(1, 1);
  t.value = `${T.zh}　—　${d.project.name}（${d.project.code}）`;
  t.font = { name: FONT, bold: true, size: 13, color: { argb: C.white } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.pine } };
  t.alignment = { vertical: "middle" };
  ws.getRow(1).height = 26;

  const r2 = ws.getRow(2);
  if (d.moduleKey === "fa") {
    r2.getCell(1).value = "项目开始日 ▶";
    r2.getCell(2).value = d.ctx.startDate ? new Date(d.ctx.startDate + "T00:00:00Z") : "未设置";
    r2.getCell(2).numFmt = "yyyy-mm-dd";
    r2.getCell(2).font = { name: FONT, bold: true, color: { argb: C.green } };
  }
  r2.getCell(4).value = `导出时间：${fmtDateTime(new Date())}　导出人：${actor}　共 ${d.items.length} 条　SOLYN ADVISORY · 商业机密`;
  r2.getCell(4).font = { name: FONT, size: 9, color: { argb: C.sage } };
  r2.getCell(1).font = { name: FONT, size: 9, color: { argb: C.sage } };

  const hr = ws.getRow(3);
  cols.forEach((c, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = c.label;
    cell.font = { name: FONT, bold: true, size: 10, color: { argb: C.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.green } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = border;
  });
  hr.height = 32;

  // 下拉选项放在隐藏工作表，避免 255 字符与换行限制
  const dvRange: Record<string, string> = {};
  let lc = 1;
  for (const f of fields) {
    if (!hasOptions(f.type) || !f.options.length || f.formula) continue;
    f.options.forEach((o, i) => (lists.getCell(i + 1, lc).value = o));
    const colL = lists.getColumn(lc).letter;
    dvRange[f.key] = `_lists!$${colL}$1:$${colL}$${f.options.length}`;
    lc++;
  }

  const depthMap = levelF ? levelDepthMap(getLevelParents(levelF.config, levelF.options)) : {};
  d.items.forEach((it, idx) => {
    const row = ws.getRow(4 + idx);
    const depth = levelF ? depthMap[String(it.data[levelF.key] ?? "")] ?? 1 : 1;
    const header = !!levelF && depth === 0;
    fields.forEach((f, i) => {
      const cell = row.getCell(i + 1);
      const v = it.data[f.key];
      if (v === null || v === undefined || v === "") cell.value = null;
      else if (f.type === "date") { cell.value = new Date(String(v) + "T00:00:00Z"); cell.numFmt = "yyyy-mm-dd"; }
      else if (f.type === "percent") { cell.value = Number(v) / 100; cell.numFmt = "0%"; }
      else if (f.type === "number") cell.value = Number(v);
      else if (f.type === "boolean") cell.value = v ? "是" : "否";
      else if (Array.isArray(v)) cell.value = v.join("、");
      else cell.value = String(v);
      cell.font = { name: FONT, size: 10, bold: !!header, color: { argb: f.formula ? "FF4F5F58" : "FF1B2A24" } };
      cell.alignment = {
        vertical: "top", wrapText: f.type === "longtext" || f.type === "select" || f.role === "title",
        horizontal: f.type === "number" || f.type === "percent" ? "right" : "left",
        indent: f.role === "title" && depth > 1 ? (depth - 1) * 2 : undefined,
      };
      cell.border = border;
      if (f.role === "status" && v) cell.font = { name: FONT, size: 10, bold: true, color: { argb: statusFont[statusKind(v)] } };
      if (f.formula?.includes("delay") && Number(v) > 0) cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.danger } };
      if (dvRange[f.key]) cell.dataValidation = { type: "list", allowBlank: true, formulae: [dvRange[f.key]], showErrorMessage: false };
      if (header) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0EC" } };
    });
    const u = row.getCell(fields.length + 1);
    u.value = fmtDateTime(it.updatedAt);
    const n = row.getCell(fields.length + 2);
    n.value = it.updatedByName || "";
    for (const c of [u, n]) {
      c.font = { name: FONT, size: 9, color: { argb: C.sage } };
      c.border = border;
      c.alignment = { vertical: "top" };
      if (header) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0EC" } };
    }
  });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + Math.max(1, d.items.length), column: lastCol } };
  // 计算列说明
  const notes = fields.filter((f) => f.formula && FORMULAS[f.formula]);
  notes.forEach((f) => (hr.getCell(fields.indexOf(f) + 1).note = `自动计算：${FORMULAS[f.formula!].desc}`));

  /* ---------------- Sheet 2: 进度汇总 ---------------- */
  const s = wb.addWorksheet("进度汇总");
  s.columns = [{ width: 34 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }];
  const sum = trackerSummary(fields, d.items, d.ctx.today);
  s.mergeCells("A1:H1");
  s.getCell("A1").value = `进度汇总　—　${d.project.name}　${T.zh}`;
  s.getCell("A1").font = { name: FONT, bold: true, size: 13, color: { argb: C.white } };
  s.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.pine } };
  s.getRow(1).height = 26;
  s.getCell("A2").value = `统计日：${d.ctx.today}　完成率 = 已完成 ÷（总数 − 不适用/中止）`;
  s.getCell("A2").font = { name: FONT, size: 9, color: { argb: C.sage } };
  let r = 4;
  const kv: [string, number | string][] = [["总数", sum.total], ["已完成", sum.done], ["完成率", sum.rate / 100], ["未完成", sum.open], ["不适用 / 中止", sum.excluded]];
  if (sum.hasDue) kv.push(["已逾期", sum.overdue], ["7 天内到期", sum.dueSoon]);
  for (const [k, v] of kv) {
    s.getCell(r, 1).value = k;
    s.getCell(r, 2).value = v;
    if (k === "完成率") s.getCell(r, 2).numFmt = "0.0%";
    s.getCell(r, 1).font = { name: FONT, size: 10 };
    s.getCell(r, 2).font = { name: FONT, size: 11, bold: true, color: { argb: C.green } };
    r++;
  }
  const table = (title: string, rows: GroupRow[]) => {
    r += 1;
    s.getCell(r, 1).value = `■ ${title}`;
    s.getCell(r, 1).font = { name: FONT, bold: true, size: 11, color: { argb: C.pine } };
    r++;
    const hdr = [title.replace(/^按/, ""), "总数", "已完成", "进行中/部分", "未开始", "不适用", "逾期", "完成率"];
    hdr.forEach((h, i) => {
      const c = s.getCell(r, i + 1);
      c.value = h;
      c.font = { name: FONT, bold: true, size: 10, color: { argb: C.white } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.green } };
      c.border = border;
      c.alignment = { horizontal: i ? "center" : "left", vertical: "middle", wrapText: true };
    });
    r++;
    for (const g of rows) {
      const vals = [g.key.replace(/\n/g, " / "), g.total, g.done, g.progress + g.partial, g.open - g.progress - g.partial, g.excluded, g.overdue, g.rate / 100];
      vals.forEach((v, i) => {
        const c = s.getCell(r, i + 1);
        c.value = v;
        c.font = { name: FONT, size: 10 };
        c.border = border;
        if (i === 7) c.numFmt = "0.0%";
        c.alignment = { horizontal: i ? "center" : "left", wrapText: true };
      });
      r++;
    }
  };
  const statusRows = [...sum.byStatus].filter(([, n]) => n > 0);
  r += 1;
  s.getCell(r, 1).value = `■ 按${statusF?.label ?? "状态"}`;
  s.getCell(r, 1).font = { name: FONT, bold: true, size: 11, color: { argb: C.pine } };
  r++;
  for (const [k, n] of statusRows) {
    s.getCell(r, 1).value = k;
    s.getCell(r, 2).value = n;
    s.getCell(r, 3).value = sum.total ? n / sum.total : 0;
    s.getCell(r, 3).numFmt = "0.0%";
    [1, 2, 3].forEach((i) => { s.getCell(r, i).border = border; s.getCell(r, i).font = { name: FONT, size: 10, color: { argb: i === 1 ? statusFont[statusKind(k)] : "FF1B2A24" } }; });
    r++;
  }
  const cat = fieldByRole(fields, "category");
  const pri = fieldByRole(fields, "priority");
  if (cat) table(`按${cat.label}`, groupStats(fields, d.items, cat, d.ctx.today));
  if (pri) table(`按${pri.label}`, groupStats(fields, d.items, pri, d.ctx.today));

  /* ---------------- Sheet 3: 变更记录 ---------------- */
  if (d.history.length) {
    const h = wb.addWorksheet("变更记录", { views: [{ state: "frozen", ySplit: 1 }] });
    h.columns = [{ header: "变更时间", width: 18 }, { header: "动作", width: 8 }, { header: "来源", width: 10 }, { header: "编号", width: 12 }, { header: "记录", width: 40 }, { header: "变更内容", width: 70 }, { header: "操作人", width: 12 }];
    h.getRow(1).eachCell((c) => { c.font = { name: FONT, bold: true, color: { argb: C.white } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.green } }; });
    const label = (k: string) => fields.find((f) => f.key === k)?.label ?? k;
    const codeK = fieldByRole(fields, "code")?.key;
    const titleK = fieldByRole(fields, "title")?.key;
    const A: Record<string, string> = { create: "新增", update: "修改", delete: "删除", restore: "恢复" };
    for (const { c, actor } of d.history) {
      const snap = c.snapshot ?? {};
      const txt = c.action === "update"
        ? Object.entries(c.changes).map(([k, x]) => `${label(k)}：${fmt(x.from)} → ${fmt(x.to)}`).join("\n")
        : c.action === "create" ? `新建（${Object.keys(c.changes).length} 个字段）` : c.action === "delete" ? "记录被删除" : "记录被恢复";
      const row = h.addRow([fmtDateTime(c.createdAt), A[c.action] ?? c.action, c.source === "import" ? "Excel 导入" : "手工", codeK ? String(snap[codeK] ?? "") : "", titleK ? String(snap[titleK] ?? "").split("\n")[0] : "", txt, actor ?? ""]);
      row.eachCell((cell) => { cell.font = { name: FONT, size: 9, color: { argb: c.action === "delete" ? C.danger : "FF1B2A24" } }; cell.alignment = { vertical: "top", wrapText: true }; });
    }
  }
  return wb.xlsx.writeBuffer();
}

function fmt(v: unknown) {
  if (v === null || v === undefined || v === "") return "（空）";
  if (Array.isArray(v)) return v.join("、");
  return String(v).replace(/\n/g, " ");
}
