import "server-only";
import path from "node:path";
import { createCipheriv, randomBytes, createHash } from "node:crypto";
import JSZip from "jszip";
import PDFKit from "pdfkit";
import ExcelJS from "exceljs";
import officeCrypto from "officecrypto-tool";
import { PDFDocument } from "@cantoo/pdf-lib";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { drawWatermark, type WmOpts, htmlParts } from "./render";
import type { VdrFile } from "@/db/schema";

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");

/* ------------------------------ PDF 水印 ------------------------------ */

/** 生成与页面同比例的透明水印图（斜向满铺），以图片形式嵌入 PDF，无法作为文字整体删除 */
async function wmPng(ratio: number, wm: WmOpts) {
  const W = 1000, H = Math.round(W * ratio);
  const c = createCanvas(W, H);
  drawWatermark(c.getContext("2d"), W, H, wm, W / 900);
  // 页脚追溯行
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(22,54,42,0.55)";
  ctx.font = `${Math.round(W / 85)}px SolynCJK, SolynLatin`;
  ctx.fillText(wm.text, W * 0.04, H - W * 0.02);
  return c.encode("png");
}

export async function watermarkPdf(bytes: Uint8Array | Buffer, wm: WmOpts) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const cache = new Map<string, Awaited<ReturnType<typeof doc.embedPng>>>();
  for (const p of doc.getPages()) {
    const { width, height } = p.getSize();
    const ratio = Math.round((height / width) * 100) / 100;
    const k = String(ratio);
    if (!cache.has(k)) cache.set(k, await doc.embedPng(await wmPng(ratio, wm)));
    p.drawImage(cache.get(k)!, { x: 0, y: 0, width, height });
  }
  doc.setProducer("SOLYN FA MASTER · VDR");
  doc.setKeywords([`solyn-recipient:${createHash("sha256").update(wm.text).digest("hex").slice(0, 16)}`]);
  return doc;
}

export async function imageToPdf(buf: Buffer, wm: WmOpts) {
  const img = await loadImage(buf);
  const maxW = 2000;
  const s = Math.min(1, maxW / img.width);
  const c = createCanvas(Math.round(img.width * s), Math.round(img.height * s));
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const jpg = await c.encode("jpeg", 88);
  const doc = await PDFDocument.create();
  const e = await doc.embedJpg(jpg);
  const pw = 595.28, ph = (pw * c.height) / c.width;
  doc.addPage([pw, ph]).drawImage(e, { x: 0, y: 0, width: pw, height: ph });
  return watermarkPdf(await doc.save(), wm);
}

/** Excel → PDF（表格内容，A4 横向分页），再加水印 */
export async function xlsxToPdf(buf: Buffer, wm: WmOpts, title: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  const pdf = new PDFKit({ size: "A4", layout: "landscape", margin: 28, font: path.join(FONT_DIR, "Jost-Regular.ttf"), info: { Title: title } });
  pdf.registerFont("cjk", path.join(FONT_DIR, "NotoSansSC-Regular.otf"));
  const chunks: Buffer[] = [];
  pdf.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((r) => pdf.on("end", () => r(Buffer.concat(chunks))));
  const PW = 841.89 - 56, BOTTOM = 595.28 - 30;
  let first = true;
  wb.eachSheet((ws) => {
    if (ws.state !== "visible") return;
    if (!first) pdf.addPage();
    first = false;
    const maxC = Math.min(ws.columnCount, 30), maxR = Math.min(ws.rowCount, 3000);
    const widths: number[] = [];
    for (let c = 1; c <= maxC; c++) {
      let w = 4;
      for (let r = 1; r <= Math.min(maxR, 200); r++) w = Math.max(w, Math.min(40, (ws.getRow(r).getCell(c).text ?? "").length));
      widths.push(w);
    }
    const sum = widths.reduce((a, b) => a + b, 0) || 1;
    const colW = widths.map((w) => (w / sum) * PW);
    let y = 28;
    pdf.font("cjk").fontSize(11).fillColor("#16362A").text(ws.name, 28, y);
    y += 20;
    for (let r = 1; r <= maxR; r++) {
      const row = ws.getRow(r);
      const vals = colW.map((_, i) => row.getCell(i + 1).text ?? "");
      pdf.fontSize(6.5);
      const h = Math.max(11, ...vals.map((v, i) => pdf.heightOfString(v || " ", { width: colW[i] - 4 }) + 3));
      if (y + h > BOTTOM) { pdf.addPage(); y = 28; }
      let x = 28;
      vals.forEach((v, i) => {
        pdf.rect(x, y, colW[i], h).lineWidth(0.3).strokeColor("#D7E0DA").stroke();
        if (v) pdf.fillColor("#1B2A24").text(v, x + 2, y + 1.5, { width: colW[i] - 4, height: h - 2 });
        x += colW[i];
      });
      y += h;
    }
  });
  pdf.end();
  return watermarkPdf(await done, wm);
}

/* ------------------------------ Word 水印（页眉艺术字） ------------------------------ */

const xmlEsc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const VML_NS = 'xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w10="urn:schemas-microsoft-com:office:word"';

function wmParagraph(text: string, opacity: number) {
  const shape = (id: string, top: string, t: string, h: number) => `<v:shape id="${id}" o:spid="_x0000_s${2049 + Number(id.slice(-1))}" type="#_x0000_t136" style="position:absolute;margin-left:0;margin-top:${top};width:470pt;height:${h}pt;rotation:315;z-index:-251654144;mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical-relative:margin" o:allowincell="f" fillcolor="#7C9A8B" stroked="f"><v:fill opacity="${Math.max(0.12, Math.min(0.5, opacity * 1.6)).toFixed(2)}"/><v:textpath style="font-family:&quot;Microsoft YaHei&quot;;font-size:1pt" string="${xmlEsc(t)}"/><w10:wrap anchorx="margin" anchory="margin"/></v:shape>`;
  return `<w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr><w:r><w:rPr><w:noProof/></w:rPr><w:pict><v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" path="m@7,l@8,m@5,21600l@6,21600e"><v:formulas><v:f eqn="sum #0 0 10800"/><v:f eqn="prod #0 2 1"/><v:f eqn="sum 21600 0 @1"/><v:f eqn="sum 0 0 @2"/><v:f eqn="sum 21600 0 @3"/><v:f eqn="if @0 @3 0"/><v:f eqn="if @0 21600 @1"/><v:f eqn="if @0 0 @2"/><v:f eqn="if @0 @4 21600"/><v:f eqn="mid @5 @6"/><v:f eqn="mid @8 @5"/><v:f eqn="mid @7 @8"/><v:f eqn="mid @6 @7"/><v:f eqn="sum @6 0 @5"/></v:formulas><v:path textpathok="t" o:connecttype="custom" o:connectlocs="@9,0;@10,10800;@11,21600;@12,10800" o:connectangles="270,180,90,0"/><v:textpath on="t" fitshape="t"/><v:handles><v:h position="#0,bottomRight" xrange="6629,14971"/></v:handles><o:lock v:ext="edit" text="t" shapetype="t"/></v:shapetype>${shape("SolynWM1", "60pt", text, 34)}${shape("SolynWM2", "360pt", text, 34)}</w:pict></w:r></w:p>`;
}

function ensureNs(xml: string, rootTag: string) {
  return xml.replace(new RegExp(`<${rootTag}\\b([^>]*)>`), (m, attrs: string) => {
    let a = attrs;
    for (const [p, uri] of [["v", "urn:schemas-microsoft-com:vml"], ["o", "urn:schemas-microsoft-com:office:office"], ["w10", "urn:schemas-microsoft-com:office:word"], ["r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships"]]) {
      if (!new RegExp(`xmlns:${p}=`).test(a)) a += ` xmlns:${p}="${uri}"`;
    }
    return `<${rootTag}${a}>`;
  });
}

/** 写入自定义文档属性（溯源编号），docx / xlsx 通用 */
async function tagOfficeProps(zip: JSZip, traceId: string, recipient: string) {
  const ct = await zip.file("[Content_Types].xml")!.async("string");
  const props = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="SolynTraceId"><vt:lpwstr>${xmlEsc(traceId)}</vt:lpwstr></property><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="3" name="SolynRecipient"><vt:lpwstr>${xmlEsc(recipient)}</vt:lpwstr></property></Properties>`;
  if (!zip.file("docProps/custom.xml")) {
    zip.file("docProps/custom.xml", props);
    if (!ct.includes("/docProps/custom.xml")) zip.file("[Content_Types].xml", ct.replace("</Types>", `<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/></Types>`));
    const rels = await zip.file("_rels/.rels")?.async("string");
    if (rels && !rels.includes("docProps/custom.xml")) zip.file("_rels/.rels", rels.replace("</Relationships>", `<Relationship Id="rIdSolynCustom" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/></Relationships>`));
  }
}

export async function watermarkDocx(buf: Buffer, wm: WmOpts, traceId: string) {
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file("word/document.xml")!.async("string");
  const relsPath = "word/_rels/document.xml.rels";
  let rels = await zip.file(relsPath)!.async("string");
  let ct = await zip.file("[Content_Types].xml")!.async("string");
  const para = wmParagraph(wm.text, wm.opacity);
  const relTarget = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?>/g)) relTarget.set(m[1], m[2]);
  for (const m of rels.matchAll(/<Relationship\b[^>]*Target="([^"]+)"[^>]*Id="([^"]+)"[^>]*\/?>/g)) relTarget.set(m[2], m[1]);
  const done = new Set<string>();
  let addedOwn = false;
  const newDoc = docXml.replace(/<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>|<w:sectPr\b[^>]*\/>/g, (sect) => {
    const refs = [...sect.matchAll(/<w:headerReference\b[^>]*w:type="(default|first|even)"[^>]*r:id="([^"]+)"[^>]*\/>|<w:headerReference\b[^>]*r:id="([^"]+)"[^>]*w:type="(default|first|even)"[^>]*\/>/g)];
    for (const r of refs) {
      const id = r[2] ?? r[3];
      const target = relTarget.get(id);
      if (target) done.add(target.replace(/^\/?word\//, ""));
    }
    const hasDefault = refs.some((r) => (r[1] ?? r[4]) === "default");
    if (hasDefault) return sect;
    addedOwn = true;
    if (sect.endsWith("/>")) return sect.replace(/\/>$/, `><w:headerReference w:type="default" r:id="rIdSolynWm"/></w:sectPr>`);
    return sect.replace(/<w:sectPr\b[^>]*>/, (o) => `${o}<w:headerReference w:type="default" r:id="rIdSolynWm"/>`);
  });
  // 已有页眉：追加水印段落
  for (const target of done) {
    const p = `word/${target}`;
    const f = zip.file(p);
    if (!f) continue;
    let x = await f.async("string");
    x = ensureNs(x, "w:hdr").replace(/<\/w:hdr>\s*$/, `${para}</w:hdr>`);
    zip.file(p, x);
  }
  // 没有默认页眉的节：新增一个只含水印的页眉
  if (addedOwn) {
    zip.file("word/header_solynwm.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ${VML_NS}>${para}</w:hdr>`);
    rels = rels.replace("</Relationships>", `<Relationship Id="rIdSolynWm" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header_solynwm.xml"/></Relationships>`);
    if (!ct.includes("/word/header_solynwm.xml")) ct = ct.replace("</Types>", `<Override PartName="/word/header_solynwm.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>`);
    zip.file(relsPath, rels);
    zip.file("[Content_Types].xml", ct);
  }
  zip.file("word/document.xml", newDoc);
  await tagOfficeProps(zip, traceId, wm.text);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export async function tagXlsx(buf: Buffer, traceId: string, recipient: string) {
  const zip = await JSZip.loadAsync(buf);
  await tagOfficeProps(zip, traceId, recipient);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/* ------------------------------ 加密 ------------------------------ */

/** AES-256 加密 PDF：打开密码 + 权限标志（打印 / 复制 / 修改） */
export async function encryptPdf(doc: PDFDocument, userPassword: string, allow: { print: boolean; copy: boolean }) {
  doc.encrypt({
    userPassword, ownerPassword: randomBytes(24).toString("base64url"),
    permissions: { printing: allow.print ? "highResolution" : false, copying: allow.copy, modifying: false, annotating: false, fillingForms: false, contentAccessibility: allow.copy, documentAssembly: false },
  });
  return Buffer.from(await doc.save());
}

/** ECMA-376 Agile（AES-256）加密 Office 文件 */
export function encryptOffice(buf: Buffer, password: string) {
  return officeCrypto.encrypt(buf, { password }) as Buffer;
}

export function newPassword() {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const b = randomBytes(12);
  return Array.from(b, (x) => A[x % A.length]).join("").replace(/(.{4})(?=.)/g, "$1-");
}

/* ------------------------------ IRM 受控文件包（.fasec） ------------------------------ */

export type FasecHeader = { v: 1; id: string; p: string; name: string; type: "pdf" | "html"; origin: string; to: string; at: string };

/** 文件包格式：FASEC1\n<base64url JSON 头>\n<12 字节 IV><AES-256-GCM 密文+16 字节 Tag> */
export function buildFasec(header: FasecHeader, payload: Buffer, key: Buffer) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(header.id));
  const ct = Buffer.concat([c.update(payload), c.final(), c.getAuthTag()]);
  const head = Buffer.from(`FASEC1\n${Buffer.from(JSON.stringify(header)).toString("base64url")}\n`);
  return Buffer.concat([head, iv, ct]);
}

/** IRM 包内容：PDF / 图片 / Excel → 带水印 PDF；Word → 带水印 HTML（在安全阅读器中渲染） */
export async function irmPayload(f: VdrFile, buf: Buffer, kind: string | null, wm: WmOpts): Promise<{ type: "pdf" | "html"; bytes: Buffer }> {
  if (kind === "pdf") return { type: "pdf", bytes: Buffer.from(await (await watermarkPdf(buf, wm)).save()) };
  if (kind === "image") return { type: "pdf", bytes: Buffer.from(await (await imageToPdf(buf, wm)).save()) };
  if (kind === "xlsx") return { type: "pdf", bytes: Buffer.from(await (await xlsxToPdf(buf, wm, f.name)).save()) };
  if (kind === "docx") return { type: "html", bytes: Buffer.from((await htmlParts(f)).join("\n"), "utf8") };
  throw new Error("该格式暂不支持 IRM 受控下载");
}
