import "server-only";
import path from "node:path";
import fs from "node:fs";
import PDFDocument from "pdfkit";

const C = { green: "#275642", pine: "#16362A", sage: "#7C9A8B", mist: "#D7E0DA", paper: "#FAF8F4", ink: "#1B2A24", sub: "#5B6B63", line: "#E3E8E4" };
const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const A4 = { w: 595.28, h: 841.89 };
const M = 50;
const W = A4.w - M * 2;

export type NdaCert = {
  projectName: string; projectCode: string; roomId: string;
  title: string; version: number; content: string; contentHash: string;
  signedName: string; userName: string; email: string; organization: string | null;
  signedAt: Date; ip: string | null; userAgent: string | null; signatureId: string;
};

const fmt = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(d) + " JST";

/** NDA 电子签署存证 PDF：协议全文 + 签署信息 + 内容哈希 */
export async function buildNdaPdf(c: NdaCert): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: M, bufferPages: true, info: { Title: `${c.title} — ${c.signedName}`, Author: "Solyn FA Master", Subject: `NDA signature ${c.signatureId}` } });
  doc.registerFont("cjk", path.join(FONT_DIR, "NotoSansSC-Regular.otf"));
  doc.registerFont("cjk-m", path.join(FONT_DIR, "NotoSansSC-Medium.otf"));
  const chunks: Buffer[] = [];
  doc.on("data", (b: Buffer) => chunks.push(b));
  const done = new Promise<Buffer>((r) => doc.on("end", () => r(Buffer.concat(chunks))));

  doc.rect(0, 0, A4.w, 110).fill(C.pine);
  const logo = path.join(process.cwd(), "public", "brand", "logo-white.png");
  if (fs.existsSync(logo)) doc.image(logo, M, 28, { height: 26 });
  doc.font("cjk").fontSize(7.5).fillColor(C.sage).text("ELECTRONIC SIGNATURE CERTIFICATE", A4.w - M - 260, 34, { width: 260, align: "right", characterSpacing: 1.5 });
  doc.font("cjk-m").fontSize(17).fillColor("#FFFFFF").text(c.title, M, 68, { width: W });

  let y = 130;
  doc.font("cjk-m").fontSize(10).fillColor(C.pine).text(`${c.projectName}（${c.projectCode}）· 数据室 ${c.roomId} · 协议版本 v${c.version}`, M, y, { width: W });
  y = doc.y + 14;
  doc.font("cjk").fontSize(9.5).fillColor(C.ink).text(c.content, M, y, { width: W, lineGap: 3.5, paragraphGap: 2 });
  y = doc.y + 24;
  if (y > A4.h - 250) { doc.addPage(); y = M; }

  doc.rect(M, y, 3, 13).fill(C.green);
  doc.font("cjk-m").fontSize(11).fillColor(C.pine).text("电子签署记录", M + 10, y);
  y += 24;
  const rows: [string, string][] = [
    ["签署人（电子签名）", c.signedName],
    ["账号", `${c.userName} <${c.email}>`],
    ["所属机构", c.organization || "—"],
    ["签署时间", fmt(c.signedAt)],
    ["签署 IP", c.ip || "—"],
    ["浏览器 / 设备", (c.userAgent || "—").slice(0, 160)],
    ["签署记录 ID", c.signatureId],
    ["协议内容 SHA-256", c.contentHash],
  ];
  for (const [k, v] of rows) {
    doc.font("cjk").fontSize(8).fillColor(C.sub).text(k, M, y, { width: 110 });
    doc.font("cjk").fontSize(8.5).fillColor(C.ink).text(v, M + 115, y, { width: W - 115 });
    y = Math.max(doc.y, y + 12) + 5;
    doc.moveTo(M, y - 2).lineTo(M + W, y - 2).lineWidth(0.4).strokeColor(C.line).stroke();
  }
  y += 10;
  doc.font("cjk").fontSize(7.5).fillColor(C.sage).text("本证书由 SOLYN FA MASTER 在签署时自动生成。上方哈希值为签署时向签署人展示的协议全文（已替换动态标签）的 SHA-256 摘要，可用于核验协议内容未被篡改。", M, y, { width: W, lineGap: 2 });

  const n = doc.bufferedPageRange().count;
  for (let i = 0; i < n; i++) {
    doc.switchToPage(i);
    doc.font("cjk").fontSize(7).fillColor(C.sage).text(`${c.signedName} · ${c.signatureId.slice(0, 8)} · ${i + 1}/${n}`, M, A4.h - 34, { width: W, align: "right", lineBreak: false });
  }
  doc.end();
  return done;
}
