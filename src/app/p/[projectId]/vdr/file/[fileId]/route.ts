import { NextResponse, type NextRequest } from "next/server";
import mammoth from "mammoth";
import ExcelJS from "exceljs";
import { getProjectAccess } from "@/lib/auth";
import { loadViewer, loadVdr, makeResolver, phaseIsOpen, faTaskStatuses, isPhaseUnlocked } from "@/lib/vdr/access";
import { readStored, streamStored } from "@/lib/vdr/storage";
import { logVdr } from "@/lib/vdr/events";
import { atLeast, previewKind } from "@/lib/vdr/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const toBody = (b: ReadableStream<Uint8Array> | Buffer): BodyInit => (Buffer.isBuffer(b) ? new Uint8Array(b) : (b as unknown as ReadableStream));
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * 文件访问入口（所有读取都经此鉴权 + 记日志）
 *  ?mode=view      在线阅览（V 及以上），返回文件字节供页面内阅览器渲染
 *  ?mode=html      Word / Excel 转网页预览（V 及以上）
 *  ?mode=download  下载原件（仅 O）
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string; fileId: string }> }) {
  const { projectId, fileId } = await params;
  const a = await getProjectAccess(projectId);
  if (!a || !a.enabledModules.has("vdr")) return new NextResponse("无权访问", { status: 403 });
  const mode = req.nextUrl.searchParams.get("mode") ?? "view";
  const viewer = await loadViewer(projectId, a.user.id, a.canManage);
  const { folders, files, perms } = await loadVdr(projectId);
  const file = files.find((f) => f.id === fileId);
  if (!file) return new NextResponse("文件不存在", { status: 404 });
  const R = makeResolver(folders, perms, viewer);
  const level = R.fileLevel(file);
  if (!viewer.isManager) {
    const phase = R.phaseOf(file.folderId);
    if (!phase || !phaseIsOpen(phase, await faTaskStatuses(projectId))) return new NextResponse("该 Phase 区尚未开放", { status: 403 });
    if (!(await isPhaseUnlocked(phase, a.user.id))) return new NextResponse("请先输入 Phase 区密码", { status: 403 });
  }
  const need = mode === "download" ? "O" : "V";
  if (!atLeast(level, need)) return new NextResponse(mode === "download" ? "无下载原件的权限" : "无阅览权限", { status: 403 });

  const noStore = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
  const disp = (type: "inline" | "attachment") => `${type}; filename*=UTF-8''${encodeURIComponent(file.name)}`;

  if (mode === "download") {
    await logVdr(projectId, a.user.id, "download", { fileId, folderId: file.folderId, detail: { name: file.name } });
    const body = await streamStored(file.storage, file.storageKey);
    return new NextResponse(toBody(body), {
      headers: { ...noStore, "Content-Type": file.contentType || "application/octet-stream", "Content-Disposition": disp("attachment") },
    });
  }

  const kind = previewKind(file.contentType, file.name);
  if (!kind) return new NextResponse("该格式不支持在线阅览", { status: 415 });
  await logVdr(projectId, a.user.id, "view", { fileId, folderId: file.folderId, detail: { name: file.name, level } });

  if (mode === "html") {
    const buf = await readStored(file.storage, file.storageKey);
    let html = "";
    if (kind === "docx") {
      const r = await mammoth.convertToHtml({ buffer: buf });
      html = r.value.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+="[^"]*"/gi, "");
    } else if (kind === "xlsx") {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
      const parts: string[] = [];
      wb.eachSheet((ws) => {
        if (ws.state !== "visible") return;
        const rows: string[] = [];
        const maxR = Math.min(ws.rowCount, 2000);
        const maxC = Math.min(ws.columnCount, 60);
        for (let r = 1; r <= maxR; r++) {
          const row = ws.getRow(r);
          const cells: string[] = [];
          for (let c = 1; c <= maxC; c++) cells.push(`<td>${esc(row.getCell(c).text ?? "")}</td>`);
          rows.push(`<tr>${cells.join("")}</tr>`);
        }
        parts.push(`<h3>${esc(ws.name)}</h3><div class="xl"><table>${rows.join("")}</table></div>${ws.rowCount > maxR ? `<p>（仅显示前 ${maxR} 行）</p>` : ""}`);
      });
      html = parts.join("");
    } else return new NextResponse("该格式请使用 view 模式", { status: 400 });
    return NextResponse.json({ html }, { headers: noStore });
  }

  const body = await streamStored(file.storage, file.storageKey);
  return new NextResponse(toBody(body), {
    headers: { ...noStore, "Content-Type": file.contentType || "application/octet-stream", "Content-Disposition": disp("inline") },
  });
}
