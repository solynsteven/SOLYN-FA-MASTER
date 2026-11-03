import { NextResponse, type NextRequest } from "next/server";
import { fileAccess, noStore, wmOpts } from "@/lib/vdr/file-access";
import { pageInfo, htmlParts } from "@/lib/vdr/render";
import { logVdr } from "@/lib/vdr/events";
import { has } from "@/lib/vdr/caps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 预览入口（不再下发原文件）：
 *  ?mode=info          页数、权限开关、文档安全策略、水印参数（记一次“阅览”）
 *  ?mode=html&part=n   Word / Excel 第 n 段 HTML（分段加载）
 * 页面图片见 ./page，下载见 ./download
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string; fileId: string }> }) {
  const { projectId, fileId } = await params;
  const r = await fileAccess(projectId, fileId, "preview");
  if (r instanceof NextResponse) return r;
  const { ctx, file, caps, security } = r;
  const mode = req.nextUrl.searchParams.get("mode") ?? "info";
  if (mode === "info") {
    const info = await pageInfo(file);
    if (!info.kind) return new NextResponse("该格式不支持在线预览", { status: 415 });
    await logVdr(projectId, ctx.access.user.id, "view", { fileId, folderId: file.folderId, detail: { name: file.name } });
    const modes = ctx.isManager ? ["watermark", "irm", "encrypted", "original"] : has(caps, "download") ? security.downloadModes : [];
    return NextResponse.json({
      kind: info.kind, pages: info.pages, ratios: info.ratios, caps, fence: security.fence, downloadModes: modes,
      irm: { expiryDays: security.irmExpiryDays, printLimit: has(caps, "print") ? security.irmPrintLimit : 0, allowCopy: has(caps, "copy") },
      watermark: wmOpts(ctx), isManager: ctx.isManager,
    }, { headers: noStore });
  }
  if (mode === "html") {
    const parts = await htmlParts(file);
    const n = Math.max(0, Number(req.nextUrl.searchParams.get("part") ?? 0));
    if (n >= parts.length) return new NextResponse("超出范围", { status: 416 });
    return NextResponse.json({ html: parts[n], parts: parts.length }, { headers: noStore });
  }
  return new NextResponse("未知模式", { status: 400 });
}
