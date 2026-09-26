import { NextResponse } from "next/server";
import { getProjectAccess } from "@/lib/auth";
import { vdrAnalytics } from "@/lib/vdr/analytics";
import { buildVdrPdf } from "@/lib/export/vdr-pdf";
import { fileStamp } from "@/lib/export/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const a = await getProjectAccess(projectId);
  if (!a || !a.canManage || !a.enabledModules.has("vdr")) return new NextResponse("仅项目管理员可导出", { status: 403 });
  const data = await vdrAnalytics(projectId);
  const buf = await buildVdrPdf(a.project, data, a.user.name);
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${a.project.code}_VDR访问分析_${fileStamp()}.pdf`)}` },
  });
}
