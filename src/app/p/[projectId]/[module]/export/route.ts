import { NextResponse, type NextRequest } from "next/server";
import { getProjectAccess } from "@/lib/auth";
import { isTrackerModule } from "@/lib/modules";
import { loadExportData, MODULE_TITLE, fileStamp } from "@/lib/export/data";
import { buildXlsx } from "@/lib/export/xlsx";
import { buildPdf } from "@/lib/export/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string; module: string }> }) {
  const { projectId, module } = await params;
  if (!isTrackerModule(module)) return new NextResponse("未知模块", { status: 404 });
  const access = await getProjectAccess(projectId);
  if (!access || !access.enabledModules.has(module)) return new NextResponse("无权访问", { status: 403 });
  const format = req.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
  const data = await loadExportData(access.project, module, format === "xlsx");
  const base = `${access.project.code}_${MODULE_TITLE[module].zh.replace(/\s/g, "")}_${fileStamp()}`;
  if (format === "pdf") {
    const buf = await buildPdf(data);
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(base + "_完成情况报告.pdf")}` },
    });
  }
  const buf = await buildXlsx(data, access.user.name);
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(base + ".xlsx")}`,
    },
  });
}
