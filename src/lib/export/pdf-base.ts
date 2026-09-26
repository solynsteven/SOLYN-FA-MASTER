import "server-only";
import path from "node:path";
import fs from "node:fs";
import PDFDocument from "pdfkit";

/** 品牌色（白底打印用） */
export const PC = { green: "#275642", pine: "#16362A", mid: "#3F6E58", sage: "#7C9A8B", mist: "#D7E0DA", paper: "#FAF8F4", ink: "#1B2A24", sub: "#5B6B63", line: "#E3E8E4", alert: "#9E4F3A", soft: "#EEF1EF" };

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const BRAND_DIR = path.join(process.cwd(), "public", "brand");
export const A4 = { w: 595.28, h: 841.89 };
export const M = 42;
export const W = A4.w - M * 2;
export const BOTTOM = A4.h - 50;

type TO = PDFKit.Mixins.TextOptions & { size?: number; color?: string; bold?: boolean };
export type PCol<R> = { h: string; w: number; align?: "left" | "center" | "right"; get: (r: R) => string; color?: (r: R) => string | undefined; bar?: (r: R) => number };

/**
 * Solyn 报告的通用 PDF 画布：深色封面条 + 反白 Logo、分节标题、KPI 卡、表格、段落、页脚。
 * 纯 ASCII 用 Jost，含中日文用思源黑体；初始字体为 Jost，避免 pdfkit 读取 Helvetica。
 */
export function createReport(opts: { title: string; en: string; docTitle: string }) {
  const doc = new PDFDocument({ size: "A4", margin: M, bufferPages: true, font: path.join(FONT_DIR, "Jost-Regular.ttf"), info: { Title: opts.docTitle, Author: "Solyn Advisory", Creator: "SOLYN FA MASTER" } });
  doc.registerFont("cjk", path.join(FONT_DIR, "NotoSansSC-Regular.otf"));
  doc.registerFont("cjk-m", path.join(FONT_DIR, "NotoSansSC-Medium.otf"));
  doc.registerFont("jost", path.join(FONT_DIR, "Jost-Regular.ttf"));
  doc.registerFont("jost-sb", path.join(FONT_DIR, "Jost-SemiBold.ttf"));
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const ended = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  const font = (s: string, bold = false) => doc.font(/^[\x00-\x7F]*$/.test(s) ? (bold ? "jost-sb" : "jost") : bold ? "cjk-m" : "cjk");
  const text = (s: string, x: number, y: number, o: TO = {}) => {
    font(s, o.bold).fontSize(o.size ?? 9).fillColor(o.color ?? PC.ink).text(s, x, y, { lineGap: 1.5, ...o });
  };
  const heightOf = (s: string, width: number, size: number, bold = false) => {
    font(s, bold).fontSize(size);
    return doc.heightOfString(s || " ", { width, lineGap: 1.5 });
  };

  const r = {
    doc, text, font, heightOf,
    y: 0,
    newPage() { doc.addPage(); r.y = M; },
    ensure(h: number) { if (r.y + h > BOTTOM) r.newPage(); },
    cover(project: { name: string }, meta: string[], note?: string) {
      doc.rect(0, 0, A4.w, 128).fill(PC.pine);
      const white = path.join(BRAND_DIR, "logo-white.png");
      if (fs.existsSync(white)) doc.image(white, M, 30, { height: 30 });
      text("SOLYN FA MASTER", A4.w - M - 200, 38, { width: 200, align: "right", size: 8, color: PC.sage, characterSpacing: 2 });
      text(opts.title, M, 78, { size: 18, color: "#FFFFFF", bold: true });
      text(opts.en.toUpperCase(), M, 104, { size: 7.5, color: PC.sage, characterSpacing: 1.6 });
      r.y = 150;
      text(project.name, M, r.y, { size: 14, bold: true, color: PC.pine });
      r.y += 22;
      text(meta.filter(Boolean).join("　·　"), M, r.y, { size: 8.5, color: PC.sub, width: W });
      r.y += heightOf(meta.join("　·　"), W, 8.5) + 4;
      if (note) { text(note, M, r.y, { size: 7.5, color: PC.sage, width: W }); r.y += heightOf(note, W, 7.5) + 4; }
      r.y += 14;
    },
    section(title: string, sub?: string) {
      if (r.y > BOTTOM - 90) r.newPage();
      doc.rect(M, r.y + 2, 3, 12).fill(PC.green);
      text(title, M + 10, r.y, { size: 11, bold: true, color: PC.pine });
      if (sub) { font(title, true).fontSize(11); text(sub, M + 10 + doc.widthOfString(title) + 12, r.y + 2.5, { size: 7.5, color: PC.sage }); }
      r.y += 22;
    },
    kpis(items: { label: string; value: string; sub?: string; alert?: boolean }[]) {
      const n = items.length;
      const kw = (W - (n - 1) * 8) / n;
      items.forEach((k, i) => {
        const x = M + i * (kw + 8);
        doc.roundedRect(x, r.y, kw, 62, 3).lineWidth(0.6).fillAndStroke(PC.paper, PC.line);
        text(k.label, x + 10, r.y + 9, { size: 8, color: PC.sub, width: kw - 16 });
        text(k.value, x + 10, r.y + 22, { size: 19, bold: true, color: k.alert ? PC.alert : PC.green });
        if (k.sub) text(k.sub, x + 10, r.y + 47, { size: 6.5, color: PC.sage, width: kw - 16 });
      });
      r.y += 80;
    },
    /** 分段条 + 图例：segments 按顺序绘制 */
    stack(segments: { label: string; n: number; color: string; dark?: boolean }[]) {
      const total = segments.reduce((a, s) => a + s.n, 0);
      if (!total) { text("暂无数据", M, r.y, { size: 8.5, color: PC.sage }); r.y += 22; return; }
      let x = M;
      for (const s of segments) {
        if (!s.n) continue;
        const w = (s.n / total) * W;
        doc.rect(x, r.y, w, 16).fill(s.color);
        if (w > 26) text(`${Math.round((s.n / total) * 100)}%`, x, r.y + 3.5, { width: w, align: "center", size: 7.5, color: s.dark ? "#FFFFFF" : PC.ink });
        x += w;
      }
      r.y += 24;
      let lx = M;
      for (const s of segments) {
        if (!s.n) continue;
        const label = `${s.label}  ${s.n}（${Math.round((s.n / total) * 1000) / 10}%）`;
        font(label).fontSize(7.8);
        const lw = doc.widthOfString(label) + 22;
        if (lx + lw > M + W) { lx = M; r.y += 14; }
        doc.rect(lx, r.y + 2, 8, 8).fill(s.color);
        if (!s.dark) doc.rect(lx, r.y + 2, 8, 8).lineWidth(0.4).stroke(PC.mist);
        text(label, lx + 12, r.y, { size: 7.8, color: PC.sub, lineBreak: false });
        lx += lw;
      }
      r.y += 26;
    },
    table<R>(rows: R[], cols0: PCol<R>[], empty = "暂无数据", size = 7.8) {
      const cols = cols0.map((c) => ({ ...c }));
      const fixed = cols.reduce((a, c) => a + c.w, 0);
      const flex = cols.filter((c) => c.w === 0);
      flex.forEach((c) => (c.w = (W - fixed) / flex.length));
      if (!rows.length) { text(empty, M, r.y, { size: 8.5, color: PC.sage }); r.y += 24; return; }
      const header = () => {
        const hh = Math.max(18, ...cols.map((c) => heightOf(c.h, c.w - 12, size, true) + 8));
        doc.rect(M, r.y, W, hh).fill(PC.mist);
        let x = M;
        for (const c of cols) { text(c.h, x + 6, r.y + 4.5, { width: c.w - 12, align: c.align ?? "left", size, bold: true, color: PC.pine }); x += c.w; }
        r.y += hh;
      };
      header();
      for (const row of rows) {
        const vals = cols.map((c) => c.get(row));
        const hgt = Math.max(18, ...vals.map((v, i) => (cols[i].bar ? 0 : heightOf(v, cols[i].w - 12, size) + 8)));
        if (r.y + hgt > BOTTOM) { r.newPage(); header(); }
        let x = M;
        vals.forEach((v, i) => {
          const c = cols[i];
          if (c.bar) {
            const bw = c.w - 52;
            doc.rect(x + 6, r.y + hgt / 2 - 3, bw, 6).fill(PC.soft);
            doc.rect(x + 6, r.y + hgt / 2 - 3, (bw * Math.max(0, Math.min(100, c.bar(row)))) / 100, 6).fill(PC.green);
            text(v, x + c.w - 42, r.y + hgt / 2 - 5.5, { width: 38, align: "right", size, color: PC.ink });
          } else text(v, x + 6, r.y + 4.5, { width: c.w - 12, align: c.align ?? "left", size, color: c.color?.(row) ?? PC.ink });
          x += c.w;
        });
        doc.moveTo(M, r.y + hgt).lineTo(M + W, r.y + hgt).lineWidth(0.4).strokeColor(PC.line).stroke();
        r.y += hgt;
      }
      r.y += 18;
    },
    /** 可跨页的段落：逐行写入，超出页底自动换页 */
    para(s: string, o: { size?: number; color?: string; bold?: boolean; indent?: number; gap?: number; width?: number } = {}) {
      const size = o.size ?? 9;
      const x = M + (o.indent ?? 0);
      const width = o.width ?? W - (o.indent ?? 0);
      for (const line of s.split("\n")) {
        const h = heightOf(line, width, size, o.bold);
        if (r.y + h > BOTTOM) {
          // 超长段落：按字符切分成能放进本页的片段
          let rest = line;
          while (rest) {
            const room = BOTTOM - r.y;
            if (room < size * 1.8) { r.newPage(); continue; }
            let lo = 1, hi = rest.length, fit = 1;
            while (lo <= hi) { const mid = (lo + hi) >> 1; if (heightOf(rest.slice(0, mid), width, size, o.bold) <= room) { fit = mid; lo = mid + 1; } else hi = mid - 1; }
            const part = rest.slice(0, fit);
            text(part, x, r.y, { size, color: o.color, bold: o.bold, width });
            r.y += heightOf(part, width, size, o.bold);
            rest = rest.slice(fit);
            if (rest) r.newPage();
          }
        } else {
          text(line || " ", x, r.y, { size, color: o.color, bold: o.bold, width });
          r.y += h;
        }
      }
      r.y += o.gap ?? 4;
    },
    rule() { doc.moveTo(M, r.y).lineTo(M + W, r.y).lineWidth(0.4).strokeColor(PC.line).stroke(); r.y += 10; },
    async finish(code: string) {
      const range = doc.bufferedPageRange();
      const pages = range.count;
      for (let i = range.start; i < range.start + pages; i++) {
        doc.switchToPage(i);
        doc.page.margins.bottom = 0;
        doc.moveTo(M, A4.h - 34).lineTo(A4.w - M, A4.h - 34).lineWidth(0.4).strokeColor(PC.line).stroke();
        text("SOLYN ADVISORY", M, A4.h - 27, { size: 7, color: PC.sage, characterSpacing: 1.2, lineBreak: false });
        text(`· 商业机密 · ${code}`, M + 78, A4.h - 27.5, { size: 7, color: PC.sage, lineBreak: false });
        text(`${i + 1} / ${pages}`, A4.w - M - 60, A4.h - 27, { width: 60, align: "right", size: 8, bold: true, color: PC.green, lineBreak: false });
      }
      doc.end();
      return ended;
    },
  };
  return r;
}
