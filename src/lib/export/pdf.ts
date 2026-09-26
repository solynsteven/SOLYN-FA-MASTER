import "server-only";
import path from "node:path";
import fs from "node:fs";
import PDFDocument from "pdfkit";
import { statusKind, type StatusKind } from "@/lib/status";
import { trackerSummary, groupStats, fieldByRole, isOverdue, shortLabel, type GroupRow } from "@/lib/tracker-stats";
import { fmtDateTime } from "@/lib/format";
import { MODULE_TITLE, type ExportData } from "./data";

/* 品牌手册：Solyn Green 主序列，Mid Green 次级，其余灰度；不引入第四种颜色 */
const C = { green: "#275642", pine: "#16362A", mid: "#3F6E58", sage: "#7C9A8B", mist: "#D7E0DA", paper: "#FAF8F4", ink: "#1B2A24", sub: "#5B6B63", line: "#E3E8E4", alert: "#9E4F3A" };
const KIND_COLOR: Record<StatusKind, string> = { done: C.green, progress: C.mid, partial: C.sage, hold: "#A9B7AF", todo: "#D7E0DA", excluded: "#ECEFED", empty: "#F3F4F3" };
const KIND_ORDER: StatusKind[] = ["done", "progress", "partial", "hold", "todo", "excluded", "empty"];

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const BRAND_DIR = path.join(process.cwd(), "public", "brand");

const A4 = { w: 595.28, h: 841.89 };
const M = 42; // 页边距
const W = A4.w - M * 2;
const BOTTOM = A4.h - 50;

export async function buildPdf(d: ExportData): Promise<Buffer> {
  const T = MODULE_TITLE[d.moduleKey];
  const doc = new PDFDocument({ size: "A4", margin: M, bufferPages: true, info: { Title: `${d.project.name} ${T.report}`, Author: "Solyn Advisory", Creator: "SOLYN FA MASTER" } });
  doc.registerFont("cjk", path.join(FONT_DIR, "NotoSansSC-Regular.otf"));
  doc.registerFont("cjk-m", path.join(FONT_DIR, "NotoSansSC-Medium.otf"));
  doc.registerFont("jost", path.join(FONT_DIR, "Jost-Regular.ttf"));
  doc.registerFont("jost-sb", path.join(FONT_DIR, "Jost-SemiBold.ttf"));
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  // 纯 ASCII 用 Jost（英文品牌字体），含中日文用思源黑体
  const font = (s: string, bold = false) => doc.font(/^[\x00-\x7F]*$/.test(s) ? (bold ? "jost-sb" : "jost") : bold ? "cjk-m" : "cjk");
  const text = (s: string, x: number, y: number, o: PDFKit.Mixins.TextOptions & { size?: number; color?: string; bold?: boolean } = {}) => {
    font(s, o.bold).fontSize(o.size ?? 9).fillColor(o.color ?? C.ink).text(s, x, y, { lineGap: 1.5, ...o });
  };
  const fields = d.fields;
  const statusF = fieldByRole(fields, "status");
  const catF = fieldByRole(fields, "category");
  const priF = fieldByRole(fields, "priority");
  const titleF = fieldByRole(fields, "title");
  const codeF = fieldByRole(fields, "code");
  const ownerF = fieldByRole(fields, "owner");
  const dueF = fieldByRole(fields, "due_date");
  const sum = trackerSummary(fields, d.items, d.ctx.today);

  /* ------------------------- 封面区（深色底 + 反白 Logo） ------------------------- */
  doc.rect(0, 0, A4.w, 128).fill(C.pine);
  const white = path.join(BRAND_DIR, "logo-white.png");
  if (fs.existsSync(white)) doc.image(white, M, 30, { height: 30 });
  text("SOLYN FA MASTER", A4.w - M - 200, 38, { width: 200, align: "right", size: 8, color: C.sage, characterSpacing: 2 });
  text(T.report, M, 78, { size: 18, color: "#FFFFFF", bold: true });
  text(`${T.en} · Progress Report`.toUpperCase(), M, 104, { size: 7.5, color: C.sage, characterSpacing: 1.6 });

  let y = 150;
  text(d.project.name, M, y, { size: 14, bold: true, color: C.pine });
  y += 22;
  const metaLine = [d.project.code, d.project.clientName, `统计日 ${d.ctx.today}`, d.moduleKey === "fa" && d.ctx.startDate ? `项目开始日 ${d.ctx.startDate}` : null, `生成于 ${fmtDateTime(new Date())}`].filter(Boolean).join("　·　");
  text(metaLine, M, y, { size: 8.5, color: C.sub });
  y += 24;

  /* ------------------------- KPI ------------------------- */
  const kpis: [string, string, string?][] = [
    [`${T.item}总数`, String(sum.total)],
    ["已完成", String(sum.done), `完成率 ${sum.rate}%`],
    sum.hasDue ? ["已逾期", String(sum.overdue), "计划完成日已过且未完成"] : ["未完成", String(sum.open), sum.partial ? `其中部分接收 ${sum.partial}` : undefined],
    [d.moduleKey === "fa" ? "中止 / 取消" : "不适用", String(sum.excluded), "不计入完成率分母"],
  ];
  const kw = (W - 3 * 10) / 4;
  kpis.forEach(([l, v, s2], i) => {
    const x = M + i * (kw + 10);
    doc.roundedRect(x, y, kw, 64, 3).lineWidth(0.6).strokeColor(C.line).fillAndStroke(C.paper, C.line);
    text(l, x + 12, y + 10, { size: 8, color: C.sub });
    text(v, x + 12, y + 23, { size: 20, bold: true, color: i === 2 && sum.hasDue && sum.overdue ? C.alert : C.green });
    if (s2) text(s2, x + 12, y + 49, { size: 6.8, color: C.sage, width: kw - 20 });
  });
  y += 84;

  /* ------------------------- 完成率进度条 ------------------------- */
  const section = (title: string, sub?: string) => {
    if (y > BOTTOM - 80) { doc.addPage(); y = M; }
    doc.rect(M, y + 2, 3, 12).fill(C.green);
    text(title, M + 10, y, { size: 11, bold: true, color: C.pine });
    if (sub) text(sub, M + 10 + doc.widthOfString(title) + 12, y + 2.5, { size: 7.5, color: C.sage });
    y += 22;
  };

  section(`${statusF?.label ?? "状态"}分布`, "完成率 = 已完成 ÷（总数 − 不适用/中止）");
  if (statusF && sum.total) {
    const entries = [...sum.byStatus].filter(([, n]) => n > 0).sort((a, b) => KIND_ORDER.indexOf(statusKind(a[0])) - KIND_ORDER.indexOf(statusKind(b[0])));
    let x = M;
    for (const [k, n] of entries) {
      const w = (n / sum.total) * W;
      doc.rect(x, y, w, 16).fill(KIND_COLOR[statusKind(k)]);
      if (w > 26) text(`${Math.round((n / sum.total) * 100)}%`, x, y + 3.5, { width: w, align: "center", size: 7.5, color: ["done", "progress", "partial"].includes(statusKind(k)) ? "#FFFFFF" : C.ink });
      x += w;
    }
    y += 24;
    let lx = M;
    for (const [k, n] of entries) {
      const label = `${k.replace(/\n/g, " ")}  ${n}`;
      font(label).fontSize(7.8);
      const lw = doc.widthOfString(label) + 22;
      if (lx + lw > M + W) { lx = M; y += 14; }
      doc.rect(lx, y + 2, 8, 8).fill(KIND_COLOR[statusKind(k)]);
      if (["excluded", "empty", "todo"].includes(statusKind(k))) doc.rect(lx, y + 2, 8, 8).lineWidth(0.4).stroke(C.mist);
      text(label, lx + 12, y, { size: 7.8, color: C.sub, lineBreak: false });
      lx += lw;
    }
    y += 26;
  } else {
    text("暂无数据", M, y, { size: 8.5, color: C.sage });
    y += 22;
  }

  /* ------------------------- 分组表 ------------------------- */
  type Col = { h: string; w: number; align?: "left" | "center" | "right"; get: (r: GroupRow) => string };
  const groupTable = (rows: GroupRow[], firstHeader: string) => {
    const cols: Col[] = [
      { h: firstHeader, w: 150, get: (r) => r.key.replace(/\n/g, " / ") },
      { h: "总数", w: 38, align: "right", get: (r) => String(r.total) },
      { h: "已完成", w: 42, align: "right", get: (r) => String(r.done) },
      { h: "进行中", w: 42, align: "right", get: (r) => String(r.progress + r.partial) },
      { h: "未开始", w: 42, align: "right", get: (r) => String(r.open - r.progress - r.partial) },
      { h: d.moduleKey === "fa" ? "中止" : "不适用", w: 40, align: "right", get: (r) => String(r.excluded) },
      ...(sum.hasDue ? [{ h: "逾期", w: 34, align: "right" as const, get: (r: GroupRow) => String(r.overdue || "—") }] : []),
      { h: "完成率", w: 0, get: (r) => `${r.rate}%` },
    ];
    const fixed = cols.reduce((a, c) => a + c.w, 0);
    cols[cols.length - 1].w = W - fixed;
    const header = () => {
      doc.rect(M, y, W, 18).fill(C.mist);
      let x = M;
      for (const c of cols) { text(c.h, x + 6, y + 4.5, { width: c.w - 12, align: c.align ?? "left", size: 7.8, bold: true, color: C.pine }); x += c.w; }
      y += 18;
    };
    header();
    for (const r of rows) {
      font(cols[0].get(r)).fontSize(8);
      const hgt = Math.max(18, doc.heightOfString(cols[0].get(r), { width: cols[0].w - 12 }) + 8);
      if (y + hgt > BOTTOM) { doc.addPage(); y = M; header(); }
      let x = M;
      cols.forEach((c, i) => {
        if (i === cols.length - 1) {
          const bw = c.w - 52;
          doc.rect(x + 6, y + hgt / 2 - 3, bw, 6).fill("#EEF1EF");
          doc.rect(x + 6, y + hgt / 2 - 3, (bw * r.rate) / 100, 6).fill(C.green);
          text(c.get(r), x + c.w - 42, y + hgt / 2 - 5.5, { width: 38, align: "right", size: 8, color: C.ink });
        } else text(c.get(r), x + 6, y + 4.5, { width: c.w - 12, align: c.align ?? "left", size: 8, color: c.h === "逾期" && r.overdue ? C.alert : C.ink });
        x += c.w;
      });
      doc.moveTo(M, y + hgt).lineTo(M + W, y + hgt).lineWidth(0.4).strokeColor(C.line).stroke();
      y += hgt;
    }
    y += 18;
  };

  if (catF) { section(`按${shortLabel(catF.label)}`, `${T.item}种类`); groupTable(groupStats(fields, d.items, catF, d.ctx.today), shortLabel(catF.label)); }
  if (priF) { section(`按${shortLabel(priF.label)}`, d.moduleKey === "fa" ? "任务级别" : "必要度级别"); groupTable(groupStats(fields, d.items, priF, d.ctx.today), shortLabel(priF.label)); }

  /* ------------------------- 重点事项清单 ------------------------- */
  type LCol = { h: string; w: number; get: (it: ExportData["items"][number]) => string; color?: string };
  const listTable = (rowsIn: ExportData["items"], cols: LCol[], empty: string) => {
    const fixed = cols.reduce((a, c) => a + c.w, 0);
    const flex = cols.find((c) => c.w === 0);
    if (flex) flex.w = W - fixed;
    if (!rowsIn.length) { text(empty, M, y, { size: 8.5, color: C.sage }); y += 24; return; }
    const header = () => {
      doc.rect(M, y, W, 18).fill(C.mist);
      let x = M;
      for (const c of cols) { text(c.h, x + 6, y + 4.5, { width: c.w - 12, size: 7.8, bold: true, color: C.pine }); x += c.w; }
      y += 18;
    };
    header();
    for (const it of rowsIn) {
      const vals = cols.map((c) => c.get(it));
      const hgt = Math.max(18, ...vals.map((v, i) => { font(v).fontSize(7.8); return doc.heightOfString(v || " ", { width: cols[i].w - 12 }) + 8; }));
      if (y + hgt > BOTTOM) { doc.addPage(); y = M; header(); }
      let x = M;
      vals.forEach((v, i) => { text(v, x + 6, y + 4.5, { width: cols[i].w - 12, size: 7.8, color: cols[i].color ?? C.ink }); x += cols[i].w; });
      doc.moveTo(M, y + hgt).lineTo(M + W, y + hgt).lineWidth(0.4).strokeColor(C.line).stroke();
      y += hgt;
    }
    y += 18;
  };
  const g = (k?: { key: string }) => (it: ExportData["items"][number]) => (k ? String(it.data[k.key] ?? "").split("\n")[0] : "");
  const title1 = (it: ExportData["items"][number]) => (titleF ? String(it.data[titleF.key] ?? "").split("\n")[0] : "");

  if (d.moduleKey === "fa") {
    const delayF = fields.find((f) => f.formula === "fa_delay_days");
    const od = d.items.filter((it) => isOverdue(it, dueF, statusF, d.ctx.today)).sort((a, b) => Number(b.data[delayF?.key ?? ""] ?? 0) - Number(a.data[delayF?.key ?? ""] ?? 0));
    section("逾期任务", od.length ? `共 ${od.length} 项，按延迟天数排序` : undefined);
    listTable(od.slice(0, 40), [
      { h: "任务编号", w: 56, get: g(codeF) }, { h: "任务", w: 0, get: title1 }, { h: "担当", w: 70, get: g(ownerF) },
      { h: "计划完成", w: 62, get: g(dueF) }, { h: "延迟", w: 40, get: (it) => `${it.data[delayF?.key ?? ""] ?? ""} 天`, color: C.alert }, { h: "状态", w: 84, get: g(statusF) },
    ], "当前没有逾期任务。");
    const next = d.items
      .filter((it) => { const k = statusKind(it.data[statusF?.key ?? ""]); const due = String(it.data[dueF?.key ?? ""] ?? ""); return k !== "done" && k !== "excluded" && due >= d.ctx.today; })
      .sort((a, b) => String(a.data[dueF?.key ?? ""]).localeCompare(String(b.data[dueF?.key ?? ""])))
      .slice(0, 15);
    section("近期待完成任务", "按计划完成日排序（前 15 项）");
    listTable(next, [
      { h: "任务编号", w: 56, get: g(codeF) }, { h: "任务", w: 0, get: title1 }, { h: "担当", w: 70, get: g(ownerF) },
      { h: "计划完成", w: 62, get: g(dueF) }, { h: "状态", w: 84, get: g(statusF) },
    ], "没有待完成的任务。");
  } else {
    const mustOpen = d.items.filter((it) => {
      const k = statusKind(it.data[statusF?.key ?? ""]);
      const p = String(it.data[priF?.key ?? ""] ?? "");
      return k !== "done" && k !== "excluded" && (!priF || p === priF.options[0]);
    });
    section(`尚未接收的${priF ? shortLabel(priF.options[0] ?? "") : ""}材料`, mustOpen.length ? `共 ${mustOpen.length} 项` : undefined);
    listTable(mustOpen.slice(0, 60), [
      { h: "材料前缀编码", w: 84, get: g(codeF) }, { h: "分类", w: 70, get: (it) => g(catF)(it).replace(/^\d+\.\s*/, "") }, { h: "资料名称", w: 0, get: title1 },
      { h: "状态", w: 90, get: g(statusF) }, { h: "提供者", w: 60, get: g(ownerF) },
    ], "必须材料已全部接收。");
  }

  /* ------------------------- 页脚 ------------------------- */
  const range = doc.bufferedPageRange();
  const pages = range.count;
  for (let i = range.start; i < range.start + pages; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // 页脚位于下边距内，避免触发自动分页
    doc.moveTo(M, A4.h - 34).lineTo(A4.w - M, A4.h - 34).lineWidth(0.4).strokeColor(C.line).stroke();
    text("SOLYN ADVISORY", M, A4.h - 27, { size: 7, color: C.sage, characterSpacing: 1.2, lineBreak: false });
    text(`· 商业机密 · ${d.project.code}`, M + 78, A4.h - 27.5, { size: 7, color: C.sage, lineBreak: false });
    text(`${i + 1} / ${pages}`, A4.w - M - 60, A4.h - 27, { width: 60, align: "right", size: 8, bold: true, color: C.green, lineBreak: false });
  }
  doc.end();
  return done;
}
