import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { vdrIrmIssues, type VdrDownloadMode } from "@/db/schema";
import { fileAccess, wmOpts } from "@/lib/vdr/file-access";
import { fileBuffer } from "@/lib/vdr/render";
import { watermarkPdf, imageToPdf, xlsxToPdf, watermarkDocx, tagXlsx, encryptPdf, encryptOffice, newPassword, buildFasec, irmPayload } from "@/lib/vdr/secure";
import { streamStored } from "@/lib/vdr/storage";
import { previewKind } from "@/lib/vdr/constants";
import { has } from "@/lib/vdr/caps";
import { logVdr } from "@/lib/vdr/events";
import { encrypt } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const disp = (name: string) => `attachment; filename*=UTF-8''${encodeURIComponent(name)}`;
const base = (n: string) => n.replace(/\.[^.]+$/, "");

/**
 * 下载：服务器实时为当前用户生成专属副本
 *  watermark  带水印 PDF（PDF / 图片 / Excel）或带水印 Word
 *  irm        .fasec 加密受控文件包（安全阅读器联网验权；可远程撤销）
 *  encrypted  AES-256 密码加密 PDF / Office（密码在响应头 X-File-Password，仅显示一次）
 *  original   原件（需文档安全策略允许；管理员始终可用）
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string; fileId: string }> }) {
  const { projectId, fileId } = await params;
  const r = await fileAccess(projectId, fileId, "download");
  if (r instanceof NextResponse) return r;
  const { ctx, file, caps, security } = r;
  const body = (await req.json().catch(() => ({}))) as { mode?: VdrDownloadMode; expiresAt?: string | null; printLimit?: number | null; allowCopy?: boolean };
  const mode = body.mode ?? "watermark";
  const allowed: VdrDownloadMode[] = ctx.isManager ? ["watermark", "irm", "encrypted", "original"] : security.downloadModes;
  if (!allowed.includes(mode)) return NextResponse.json({ error: "该文件的文档安全策略不允许此下载方式" }, { status: 403 });
  const kind = previewKind(file.contentType, file.name);
  const uid = ctx.access.user.id;
  const traceId = randomBytes(6).toString("hex").toUpperCase();
  const wm = wmOpts(ctx, `${ctx.watermark} · #${traceId}`);
  const headers: Record<string, string> = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Trace-Id": traceId, "Access-Control-Expose-Headers": "X-File-Password, X-Trace-Id, X-Issue-Id, Content-Disposition" };

  try {
    if (mode === "original") {
      await logVdr(projectId, uid, "download_original", { fileId, folderId: file.folderId, detail: { name: file.name } });
      const s = await streamStored(file.storage, file.storageKey);
      return new NextResponse(Buffer.isBuffer(s) ? new Uint8Array(s) : (s as unknown as ReadableStream), { headers: { ...headers, "Content-Type": file.contentType || "application/octet-stream", "Content-Disposition": disp(file.name) } });
    }
    if (!kind) return NextResponse.json({ error: "该格式只能下载原件（需策略允许）" }, { status: 415 });
    const buf = await fileBuffer(file);

    if (mode === "watermark") {
      let out: Buffer, name: string, ct: string;
      if (kind === "docx") { out = await watermarkDocx(buf, wm, traceId); name = file.name; ct = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"; }
      else {
        const doc = kind === "pdf" ? await watermarkPdf(buf, wm) : kind === "image" ? await imageToPdf(buf, wm) : await xlsxToPdf(buf, wm, file.name);
        out = Buffer.from(await doc.save()); name = `${base(file.name)}.pdf`; ct = "application/pdf";
      }
      const [iss] = await db.insert(vdrIrmIssues).values({ projectId, fileId, userId: uid, kind: "watermark", fileName: name, policy: {} }).returning();
      await logVdr(projectId, uid, "download_watermark", { fileId, folderId: file.folderId, detail: { name: file.name, traceId, issueId: iss.id } });
      return new NextResponse(new Uint8Array(out), { headers: { ...headers, "Content-Type": ct, "Content-Disposition": disp(name), "X-Issue-Id": iss.id } });
    }

    if (mode === "encrypted") {
      const pw = newPassword();
      let out: Buffer, name: string, ct: string, kindOut: "pdf" | "office";
      if (kind === "docx") { out = encryptOffice(await watermarkDocx(buf, wm, traceId), pw); name = file.name; ct = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"; kindOut = "office"; }
      else if (kind === "xlsx" && body.allowCopy !== false && (ctx.isManager || has(caps, "copy"))) { out = encryptOffice(await tagXlsx(buf, traceId, wm.text), pw); name = file.name; ct = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; kindOut = "office"; }
      else {
        const doc = kind === "pdf" ? await watermarkPdf(buf, wm) : kind === "image" ? await imageToPdf(buf, wm) : await xlsxToPdf(buf, wm, file.name);
        out = await encryptPdf(doc, pw, { print: ctx.isManager || has(caps, "print"), copy: ctx.isManager || has(caps, "copy") });
        name = `${base(file.name)}.pdf`; ct = "application/pdf"; kindOut = "pdf";
      }
      const [iss] = await db.insert(vdrIrmIssues).values({ projectId, fileId, userId: uid, kind: kindOut, fileName: name, passwordEnc: encrypt(pw), policy: { allowCopy: has(caps, "copy") } }).returning();
      await logVdr(projectId, uid, "download_encrypted", { fileId, folderId: file.folderId, detail: { name: file.name, traceId, issueId: iss.id, format: kindOut } });
      return new NextResponse(new Uint8Array(out), { headers: { ...headers, "Content-Type": ct, "Content-Disposition": disp(name), "X-File-Password": pw, "X-Issue-Id": iss.id } });
    }

    // IRM 受控文件包：策略不得宽于用户自身权限与文档安全策略
    const maxExpiry = Date.now() + Math.max(1, security.irmExpiryDays) * 86400_000;
    let expiresAt = body.expiresAt ? new Date(body.expiresAt).getTime() : maxExpiry;
    if (!ctx.isManager) expiresAt = Math.min(expiresAt, maxExpiry);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now() + 3600_000) return NextResponse.json({ error: "有效期至少 1 小时" }, { status: 400 });
    const capPrint = ctx.isManager || has(caps, "print");
    const printLimit = !capPrint ? 0 : Math.max(0, Math.min(ctx.isManager ? 999 : security.irmPrintLimit, body.printLimit ?? security.irmPrintLimit));
    const allowCopy = (ctx.isManager || has(caps, "copy")) && body.allowCopy !== false;
    const key = randomBytes(32);
    const payload = await irmPayload(file, buf, kind, wm);
    const name = `${base(file.name)}.fasec`;
    const [iss] = await db.insert(vdrIrmIssues).values({
      projectId, fileId, userId: uid, kind: "package", fileName: file.name, keyEnc: encrypt(key.toString("base64")),
      policy: { expiresAt: new Date(expiresAt).toISOString(), printLimit, allowCopy },
    }).returning();
    const origin = req.headers.get("x-forwarded-host") ? `https://${req.headers.get("x-forwarded-host")}` : req.nextUrl.origin;
    const out = buildFasec({ v: 1, id: iss.id, p: projectId, name: file.name, type: payload.type, origin, to: ctx.access.user.email, at: new Date().toISOString() }, payload.bytes, key);
    await logVdr(projectId, uid, "download_irm", { fileId, folderId: file.folderId, detail: { name: file.name, traceId, issueId: iss.id, expiresAt: new Date(expiresAt).toISOString(), printLimit, allowCopy } });
    return new NextResponse(new Uint8Array(out), { headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Disposition": disp(name), "X-Issue-Id": iss.id } });
  } catch (e) {
    console.error("[vdr download]", e);
    return NextResponse.json({ error: `生成下载文件失败：${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
