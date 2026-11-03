import "server-only";
import path from "node:path";
import mammoth from "mammoth";
import ExcelJS from "exceljs";
import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import type { VdrFile } from "@/db/schema";
import { readStored } from "./storage";
import { previewKind } from "./constants";

/**
 * 服务端分页渲染：PDF / 图片在服务器上逐页栅格化并烧入该用户的动态水印，浏览器只拿到单页图片，
 * 不会下发完整原文件；Word / Excel 转为 HTML 后分段下发。
 */

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "NotoSansSC-Regular.otf"), "SolynCJK");
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "Jost-Regular.ttf"), "SolynLatin");
  // PDF 未嵌入的字体（日文文档常见的 MS 明朝 / MS ゴシック 等）由 pdf.js 以 fillText + 通用字族（sans-serif / serif）绘制。
  // 服务器（Vercel）上没有系统字体，需把通用字族指向自带的 Noto Sans CJK，否则中日文内容渲染为空白或方框。
  for (const alias of ["sans-serif", "serif", "monospace", "system-ui"]) {
    GlobalFonts.registerFromPath(path.join(FONT_DIR, "NotoSansSC-Regular.otf"), alias);
    GlobalFonts.registerFromPath(path.join(FONT_DIR, "NotoSansSC-Medium.otf"), alias);
  }
  fontsReady = true;
}

/* ---------------- 进程内 LRU 缓存（同一函数实例内复用原文件与解析结果） ---------------- */
class Lru<V> {
  private m = new Map<string, { v: V; size: number }>();
  private total = 0;
  constructor(private max: number) {}
  get(k: string) {
    const e = this.m.get(k);
    if (!e) return undefined;
    this.m.delete(k);
    this.m.set(k, e);
    return e.v;
  }
  set(k: string, v: V, size: number) {
    if (this.m.has(k)) { this.total -= this.m.get(k)!.size; this.m.delete(k); }
    this.m.set(k, { v, size });
    this.total += size;
    while (this.total > this.max && this.m.size > 1) {
      const [fk, fe] = this.m.entries().next().value as [string, { v: V; size: number }];
      this.m.delete(fk);
      this.total -= fe.size;
    }
  }
}
const bufCache = new Lru<Buffer>(120 * 1024 * 1024);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pdfCache = new Lru<Promise<any>>(40);
const htmlCache = new Lru<string[]>(30 * 1024 * 1024);

const keyOf = (f: Pick<VdrFile, "id" | "updatedAt">) => `${f.id}:${f.updatedAt.getTime()}`;

export async function fileBuffer(f: VdrFile) {
  const k = keyOf(f);
  const hit = bufCache.get(k);
  if (hit) return hit;
  const b = await readStored(f.storage, f.storageKey);
  bufCache.set(k, b, b.length);
  return b;
}

async function pdfjs() {
  return import("pdfjs-node/legacy/build/pdf.mjs");
}
const PDFJS_DIR = path.join(process.cwd(), "node_modules", "pdfjs-node");

async function pdfDoc(f: VdrFile) {
  const k = keyOf(f);
  let p = pdfCache.get(k);
  if (!p) {
    p = (async () => {
      const lib = await pdfjs();
      const data = new Uint8Array(await fileBuffer(f));
      return lib.getDocument({
        data, cMapUrl: path.join(PDFJS_DIR, "cmaps") + "/", cMapPacked: true,
        standardFontDataUrl: path.join(PDFJS_DIR, "standard_fonts") + "/", isEvalSupported: false, disableFontFace: true, useSystemFonts: false,
      }).promise;
    })();
    pdfCache.set(k, p, 1);
    p.catch(() => pdfCache.set(k, Promise.reject(new Error("PDF 解析失败")), 1));
  }
  return p;
}

export type WmOpts = { text: string; opacity: number; size: number; density: number };

/** 斜向满铺水印：错行排布、整页覆盖，裁剪难以去除 */
export function drawWatermark(ctx: SKRSContext2D, w: number, h: number, o: WmOpts, scale = 1) {
  ensureFonts();
  const fs = Math.max(10, o.size * scale);
  ctx.save();
  ctx.fillStyle = `rgba(22, 54, 42, ${Math.min(0.5, Math.max(0.05, o.opacity))})`;
  ctx.font = `${fs}px SolynCJK, SolynLatin`;
  ctx.textBaseline = "middle";
  const tw = ctx.measureText(o.text).width + fs * 3;
  const gapY = (fs * 7) / Math.max(0.5, o.density);
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 7);
  const R = Math.hypot(w, h);
  let row = 0;
  for (let y = -R; y < R; y += gapY, row++) {
    for (let x = -R + (row % 2) * (tw / 2); x < R; x += tw) ctx.fillText(o.text, x, y);
  }
  ctx.restore();
}

export async function pageInfo(f: VdrFile): Promise<{ kind: "pdf" | "image" | "docx" | "xlsx" | null; pages: number; ratios: number[] }> {
  const kind = previewKind(f.contentType, f.name);
  if (kind === "pdf") {
    const doc = await pdfDoc(f);
    const ratios: number[] = [];
    const n = doc.numPages as number;
    for (let i = 1; i <= Math.min(n, 400); i++) {
      const vp = (await doc.getPage(i)).getViewport({ scale: 1 });
      ratios.push(vp.height / vp.width);
    }
    return { kind, pages: n, ratios };
  }
  if (kind === "image") {
    const img = await loadImage(await fileBuffer(f));
    return { kind, pages: 1, ratios: [img.height / Math.max(1, img.width)] };
  }
  if (kind === "docx" || kind === "xlsx") return { kind, pages: (await htmlParts(f)).length, ratios: [] };
  return { kind, pages: 0, ratios: [] };
}

/** 渲染第 n 页为 WebP（宽度 width 像素），烧入水印 */
export async function renderPage(f: VdrFile, n: number, width: number, wm: WmOpts) {
  const kind = previewKind(f.contentType, f.name);
  const W = Math.max(400, Math.min(2000, Math.round(width)));
  if (kind === "pdf") {
    ensureFonts();
    const doc = await pdfDoc(f);
    if (n < 1 || n > doc.numPages) throw new Error("页码超出范围");
    const page = await doc.getPage(n);
    const vp0 = page.getViewport({ scale: 1 });
    const scale = W / vp0.width;
    const vp = page.getViewport({ scale });
    const canvas = createCanvas(Math.round(vp.width), Math.round(vp.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
    drawWatermark(ctx, canvas.width, canvas.height, wm, W / 900);
    return canvas.encode("webp", 82);
  }
  if (kind === "image") {
    const img = await loadImage(await fileBuffer(f));
    const scale = Math.min(1, W / img.width);
    const cw = Math.round(img.width * scale), ch = Math.round(img.height * scale);
    const canvas = createCanvas(cw, ch);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    drawWatermark(ctx, cw, ch, wm, cw / 900);
    return canvas.encode("webp", 85);
  }
  throw new Error("该格式不支持分页渲染");
}

/** 「复制文本」权限：返回第 n 页的文字块与位置（比例坐标），供预览器叠加可选中的透明文字层 */
export async function pageText(f: VdrFile, n: number) {
  if (previewKind(f.contentType, f.name) !== "pdf") return [];
  const doc = await pdfDoc(f);
  const page = await doc.getPage(n);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const out: { s: string; x: number; y: number; w: number; h: number }[] = [];
  for (const it of tc.items as { str: string; transform: number[]; width: number; height: number }[]) {
    if (!it.str?.trim()) continue;
    const [, , , d, e, fy] = it.transform;
    const h = Math.abs(d) || it.height || 10;
    out.push({ s: it.str, x: e / vp.width, y: (vp.height - fy - h) / vp.height, w: it.width / vp.width, h: (h * 1.15) / vp.height });
  }
  return out;
}

/* ---------------- Word / Excel → 分段 HTML ---------------- */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** 按顶层块切分 HTML（不拆开表格、列表） */
function splitTopLevel(html: string, maxChars = 12000) {
  const parts: string[] = [];
  let depth = 0, last = 0, cur = "";
  const re = /<(\/?)([a-zA-Z0-9]+)[^>]*?(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const [, close, , self] = m;
    if (self) continue;
    if (/^(br|img|hr|meta|input|col)$/i.test(m[2])) continue;
    depth += close ? -1 : 1;
    if (depth === 0) {
      cur += html.slice(last, re.lastIndex);
      last = re.lastIndex;
      if (cur.length >= maxChars) { parts.push(cur); cur = ""; }
    }
  }
  cur += html.slice(last);
  if (cur.trim()) parts.push(cur);
  return parts.length ? parts : [""];
}

export async function htmlParts(f: VdrFile): Promise<string[]> {
  const k = keyOf(f);
  const hit = htmlCache.get(k);
  if (hit) return hit;
  const kind = previewKind(f.contentType, f.name);
  const buf = await fileBuffer(f);
  let parts: string[] = [];
  if (kind === "docx") {
    const r = await mammoth.convertToHtml({ buffer: buf });
    const html = r.value.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+="[^"]*"/gi, "");
    parts = splitTopLevel(html);
  } else if (kind === "xlsx") {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
    wb.eachSheet((ws) => {
      if (ws.state !== "visible") return;
      const maxC = Math.min(ws.columnCount, 60);
      const maxR = Math.min(ws.rowCount, 5000);
      for (let start = 1; start <= Math.max(1, maxR); start += 200) {
        const rows: string[] = [];
        for (let r = start; r <= Math.min(maxR, start + 199); r++) {
          const row = ws.getRow(r);
          const cells: string[] = [`<th>${r}</th>`];
          for (let c = 1; c <= maxC; c++) cells.push(`<td>${esc(row.getCell(c).text ?? "")}</td>`);
          rows.push(`<tr>${cells.join("")}</tr>`);
        }
        parts.push(`${start === 1 ? `<h3>${esc(ws.name)}</h3>` : ""}<div class="xl"><table>${rows.join("")}</table></div>${start + 199 >= maxR && ws.rowCount > maxR ? `<p>（仅显示前 ${maxR} 行）</p>` : ""}`);
      }
    });
  }
  if (!parts.length) parts = [""];
  htmlCache.set(k, parts, parts.reduce((s, p) => s + p.length * 2, 0));
  return parts;
}
