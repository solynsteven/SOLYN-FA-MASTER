import "server-only";
import path from "node:path";
import fs from "node:fs";
import PDFDocument from "pdfkit";
import type { Project } from "@/db/schema";
import type { VdrAnalytics } from "@/lib/vdr/analytics";
import { fmtDateTime } from "@/lib/format";

const C = { green: "#275642", pine: "#16362A", mid: "#3F6E58", sage: "#7C9A8B", mist: "#D7E0DA", paper: "#FAF8F4", ink: "#1B2A24", sub: "#5B6B63", line: "#E3E8E4", alert: "#9E4F3A" };
// 打印在白底上：阅览 / 打印 / 下载 用同一色相由浅到深的三档，保证白底可辨
const ACT_COLOR = ["#A9BDB2", "#5E9C7E", "#275642"];
const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const A4 = { w: 595.28, h: 841.89 };
const M = 42;
const W = A4.w - M * 2;
const BOTTOM = A4.h - 50;
const STATUS: Record<string, string> = { active: "活跃", cooling: "近期未访问", stopped: "突然停止", none: "从未访问" };

export async function buildVdrPdf(project: Project, d: VdrAnalytics, actor: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: M, bufferPages: true, font: path.join(FONT_DIR, "Jost-Regular.ttf"), info: { Title: `${project.name} VDR 访问分析报告`, Author: "Solyn Advisory" } });
  doc.registerFont("cjk", path.join(FONT_DIR, "NotoSansSC-Regular.otf"));
  doc.registerFont("cjk-m", path.join(FONT_DIR, "NotoSansSC-Medium.otf"));
  doc.registerFont("jost", path.join(FONT_DIR, "Jost-Regular.ttf"));
  doc.registerFont("jost-sb", path.join(FONT_DIR, "Jost-SemiBold.ttf"));
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  const font = (s: string, bold = false) => doc.font(/^[\x00-\x7F]*$/.test(s) ? (bold ? "jost-sb" : "jost") : bold ? "cjk-m" : "cjk");
  const text = (s: string, x: number, y: number, o: PDFKit.Mixins.TextOptions & { size?: number; color?: string; bold?: boolean } = {}) =>
    font(s, o.bold).fontSize(o.size ?? 9).fillColor(o.color ?? C.ink).text(s, x, y, { lineGap: 1.5, ...o });

  doc.rect(0, 0, A4.w, 128).fill(C.pine);
  const white = path.join(process.cwd(), "public", "brand", "logo-white.png");
  if (fs.existsSync(white)) doc.image(white, M, 30, { height: 30 });
  text("SOLYN FA MASTER", A4.w - M - 200, 38, { width: 200, align: "right", size: 8, color: C.sage, characterSpacing: 2 });
  text("VDR 访问分析报告", M, 78, { size: 18, color: "#FFFFFF", bold: true });
  text("VIRTUAL DATA ROOM · ACCESS ANALYTICS", M, 104, { size: 7.5, color: C.sage, characterSpacing: 1.6 });
  let y = 150;
  text(project.name, M, y, { size: 14, bold: true, color: C.pine });
  y += 22;
  text([project.code, `统计范围：最近 ${d.params.windowDays} 天`, `生成于 ${fmtDateTime(new Date())}`, `导出人 ${actor}`].join("　·　"), M, y, { size: 8.5, color: C.sub });
  y += 14;
  text("买家对比按所属机构汇总，不含卖方 FA（ADM）与项目管理员的访问。", M, y, { size: 7.5, color: C.sage });
  y += 22;

  const kpis: [string, string, string?][] = [
    ["外部访问次数", String(d.kpi.accesses), `阅览 ${d.kpi.views} · 打印 ${d.kpi.prints} · 下载 ${d.kpi.downloads}`],
    ["访问用户 / 机构", `${d.kpi.users} / ${d.kpi.orgs}`],
    ["被反复查看的文件", String(d.kpi.repeatFiles), `同一用户查看 ≥ ${d.params.repeatThreshold} 次`],
    ["突然停止访问", String(d.kpi.stopped), `近 ${d.params.stopRecentDays} 天无访问`],
  ];
  const kw = (W - 30) / 4;
  kpis.forEach(([l, v, s], i) => {
    const x = M + i * (kw + 10);
    doc.roundedRect(x, y, kw, 62, 3).lineWidth(0.6).fillAndStroke(C.paper, C.line);
    text(l, x + 10, y + 9, { size: 8, color: C.sub });
    text(v, x + 10, y + 22, { size: 19, bold: true, color: i === 3 && d.kpi.stopped ? C.alert : C.green });
    if (s) text(s, x + 10, y + 47, { size: 6.5, color: C.sage, width: kw - 16 });
  });
  y += 82;

  const section = (t: string, sub?: string) => {
    if (y > BOTTOM - 90) { doc.addPage(); y = M; }
    doc.rect(M, y + 2, 3, 12).fill(C.green);
    text(t, M + 10, y, { size: 11, bold: true, color: C.pine });
    if (sub) { font(t, true).fontSize(11); text(sub, M + 22 + doc.widthOfString(t), y + 2.5, { size: 7.5, color: C.sage }); }
    y += 22;
  };
  type Col = { h: string; w: number; align?: "left" | "right" | "center" };
  const table = (cols: Col[], rows: (string | { bar: number[]; max: number })[][], empty: string) => {
    const flex = cols.find((c) => c.w === 0);
    if (flex) flex.w = W - cols.reduce((s, c) => s + c.w, 0);
    if (!rows.length) { text(empty, M, y, { size: 8.5, color: C.sage }); y += 22; return; }
    const header = () => {
      doc.rect(M, y, W, 18).fill(C.mist);
      let x = M;
      for (const c of cols) { text(c.h, x + 5, y + 4.5, { width: c.w - 10, size: 7.5, bold: true, color: C.pine, align: c.align }); x += c.w; }
      y += 18;
    };
    header();
    for (const r of rows) {
      const hgt = Math.max(18, ...r.map((v, i) => (typeof v === "string" ? (font(v).fontSize(7.8), doc.heightOfString(v || " ", { width: cols[i].w - 10 }) + 8) : 18)));
      if (y + hgt > BOTTOM) { doc.addPage(); y = M; header(); }
      let x = M;
      r.forEach((v, i) => {
        if (typeof v === "string") text(v, x + 5, y + 4.5, { width: cols[i].w - 10, size: 7.8, align: cols[i].align, color: v === "突然停止" ? C.alert : C.ink });
        else {
          const tot = v.bar.reduce((a, b) => a + b, 0);
          let bx = x + 5;
          const full = ((cols[i].w - 10) * tot) / Math.max(1, v.max);
          v.bar.forEach((n, j) => { if (!n) return; const w = (full * n) / tot; doc.rect(bx, y + hgt / 2 - 3.5, Math.max(0.5, w - 1), 7).fill(ACT_COLOR[j]); bx += w; });
        }
        x += cols[i].w;
      });
      doc.moveTo(M, y + hgt).lineTo(M + W, y + hgt).lineWidth(0.4).strokeColor(C.line).stroke();
      y += hgt;
    }
    y += 16;
  };

  const stopped = d.orgs.filter((o) => o.status === "stopped");
  if (stopped.length) {
    section("需要关注：突然停止访问的买家");
    table([{ h: "机构", w: 0 }, { h: "权限组", w: 60 }, { h: "此前访问", w: 60, align: "right" }, { h: "最后访问", w: 100 }, { h: "已停止", w: 60, align: "right" }],
      stopped.map((o) => [o.org, o.groups.join("/"), String(o.prior), fmtDateTime(o.last), `${o.daysSince} 天`]), "");
  }

  section("各买家访问强度", "条形：阅览 / 打印 / 下载（由浅到深）");
  const maxOrg = Math.max(1, ...d.orgs.map((o) => o.total));
  table(
    [{ h: "机构", w: 110 }, { h: "组", w: 44 }, { h: "访问构成", w: 0 }, { h: "次数", w: 38, align: "right" }, { h: "用户", w: 30, align: "right" }, { h: "文件", w: 30, align: "right" }, { h: "最后访问", w: 72 }, { h: "状态", w: 52 }],
    d.orgs.map((o) => [o.org, o.groups.join("/"), { bar: [o.views, o.prints, o.downloads], max: maxOrg }, String(o.total), String(o.users), String(o.files), o.last ? fmtDateTime(o.last).slice(5) : "—", STATUS[o.status]]),
    "暂无外部访问。",
  );

  section("被查看最多的文件", `↻ = 同一用户查看 ≥ ${d.params.repeatThreshold} 次`);
  table(
    [{ h: "文件", w: 0 }, { h: "阅览", w: 34, align: "right" }, { h: "打印", w: 34, align: "right" }, { h: "下载", w: 34, align: "right" }, { h: "人数", w: 34, align: "right" }, { h: "查看最多", w: 120 }],
    d.topFiles.slice(0, 20).map((f) => [`${f.repeat ? "↻ " : ""}${f.name}${f.path ? `\n${f.path}` : ""}`, String(f.views), String(f.prints), String(f.downloads), String(f.viewers), f.maxByOneName ? `${f.maxByOneName}（${f.maxByOneOrg}）×${f.maxByOne}` : "—"]),
    "暂无访问。",
  );

  section("按权限组");
  const maxG = Math.max(1, ...d.groups.map((g) => g.total));
  table([{ h: "权限组", w: 60 }, { h: "访问构成", w: 0 }, { h: "阅览", w: 40, align: "right" }, { h: "打印", w: 40, align: "right" }, { h: "下载", w: 40, align: "right" }, { h: "用户", w: 40, align: "right" }],
    d.groups.map((g) => [g.group, { bar: [g.views, g.prints, g.downloads], max: maxG }, String(g.views), String(g.prints), String(g.downloads), String(g.users)]), "");

  section("最近访问记录", "最近 40 条");
  const A: Record<string, string> = { view: "阅览", print: "打印", download: "下载" };
  table([{ h: "时间", w: 78 }, { h: "用户", w: 70 }, { h: "机构", w: 90 }, { h: "动作", w: 34 }, { h: "文件", w: 0 }],
    d.recent.slice(0, 40).map((r) => [fmtDateTime(r.at).slice(5), r.user + (r.internal ? "（内部）" : ""), r.org, A[r.action], r.file]), "暂无记录。");

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.moveTo(M, A4.h - 34).lineTo(A4.w - M, A4.h - 34).lineWidth(0.4).strokeColor(C.line).stroke();
    text("SOLYN ADVISORY", M, A4.h - 27, { size: 7, color: C.sage, characterSpacing: 1.2, lineBreak: false });
    text(`· 商业机密 · ${project.code}`, M + 78, A4.h - 27.5, { size: 7, color: C.sage, lineBreak: false });
    text(`${i + 1} / ${range.count}`, A4.w - M - 60, A4.h - 27, { width: 60, align: "right", size: 8, bold: true, color: C.green, lineBreak: false });
  }
  doc.end();
  return done;
}
