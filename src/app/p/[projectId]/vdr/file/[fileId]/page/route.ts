import { NextResponse, type NextRequest } from "next/server";
import { fileAccess, wmOpts } from "@/lib/vdr/file-access";
import { renderPage, pageText, renderDiag } from "@/lib/vdr/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 单页渲染：?n=页码&w=宽度 → 烧入水印的 WebP；&text=1（需「复制文本」权限）→ 文字层 JSON */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string; fileId: string }> }) {
  const { projectId, fileId } = await params;
  const wantText = req.nextUrl.searchParams.get("text") === "1";
  const r = await fileAccess(projectId, fileId, wantText ? "copy" : "preview");
  if (r instanceof NextResponse) return r;
  const n = Math.max(1, Number(req.nextUrl.searchParams.get("n") ?? 1) | 0);
  try {
    if (req.nextUrl.searchParams.get("diag") === "1" && r.ctx.isManager) return NextResponse.json(await renderDiag(r.file), { headers: { "Cache-Control": "no-store" } });
    if (wantText) return NextResponse.json(await pageText(r.file, n), { headers: { "Cache-Control": "private, no-store" } });
    const w = Number(req.nextUrl.searchParams.get("w") ?? 1200) || 1200;
    const img = await renderPage(r.file, n, w, wmOpts(r.ctx));
    return new NextResponse(new Uint8Array(img), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" },
    });
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : "渲染失败", { status: 500 });
  }
}
