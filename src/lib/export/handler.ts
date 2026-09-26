import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getProjectAccess } from "@/lib/auth";
import { isTrackerModule } from "@/lib/modules";
import { qaViewer, filterQa, accessKey, canSee } from "@/lib/qa/access";
import { seedDefaultFields } from "@/lib/project-service";
import { loadExportData, MODULE_TITLE, fileStamp } from "./data";
import { buildXlsx } from "./xlsx";
import { buildPdf } from "./pdf";
import { buildQaPdf } from "./qa-pdf";

/** FA / DD / Q&A 导出（Excel 跟踪表 / PDF 完成情况报告） */
export async function handleTrackerExport(req: NextRequest, projectId: string, module: string) {
  if (!isTrackerModule(module)) return new NextResponse("未知模块", { status: 404 });
  const access = await getProjectAccess(projectId);
  if (!access || !access.enabledModules.has(module)) return new NextResponse("无权访问", { status: 403 });
  const viewer = module === "qa" ? await qaViewer(projectId) : null;
  if (viewer && viewer.rank === 0) return new NextResponse("无 Q&A 权限", { status: 403 });
  if (module === "qa") await seedDefaultFields(projectId, "qa");
  const format = req.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
  const data = await loadExportData(access.project, module, format === "xlsx");
  if (viewer) {
    // 只导出当前权限组有权阅读的记录
    data.items = filterQa(data.items, data.fields, viewer.rank);
    const ak = accessKey(data.fields);
    data.history = data.history.filter(({ c }) => canSee(viewer.rank, c.snapshot?.[ak]));
  }
  const base = `${access.project.code}_${MODULE_TITLE[module].zh.replace(/\s/g, "")}_${fileStamp()}`;
  if (format === "pdf") {
    const buf = module === "qa" ? await buildQaPdf(data, { name: access.user.name, group: viewer?.group ?? null, isManager: !!viewer?.isManager }) : await buildPdf(data);
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(base + "_完成情况报告.pdf")}` },
    });
  }
  const buf = await buildXlsx(data, access.user.name + (viewer && !viewer.isManager ? `（权限组 ${viewer.group}）` : ""));
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(base + ".xlsx")}`,
    },
  });
}
