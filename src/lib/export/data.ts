import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { users, type FieldDefinition, type Project } from "@/db/schema";
import { listFields } from "@/lib/queries";
import { listItemsDerived, moduleHistory } from "@/lib/tracker";
import { vdrFolderPaths } from "@/lib/vdr/folder-paths";

export type ExportData = Awaited<ReturnType<typeof loadExportData>>;

export async function loadExportData(project: Project, moduleKey: "fa" | "dd" | "qa", withHistory: boolean) {
  const fields: FieldDefinition[] = await listFields(project.id, moduleKey);
  const { items, ctx } = await listItemsDerived(project.id, moduleKey, fields);
  const ids = [...new Set(items.map((i) => i.updatedBy).filter(Boolean))] as string[];
  const names = ids.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : [];
  const uname = new Map(names.map((u) => [u.id, u.name]));
  const history = withHistory ? await moduleHistory(project.id, moduleKey, 3000) : [];
  // 「VDR 文件夹」字段导出为文件夹路径（再次导入时按路径识别回文件夹）
  const folderKeys = fields.filter((f) => f.type === "vdrfolder").map((f) => f.key);
  if (folderKeys.length) {
    const paths = new Map((await vdrFolderPaths(project.id)).map((f) => [f.id, f.path]));
    for (const it of items) for (const k of folderKeys) {
      const v = it.data[k];
      if (typeof v === "string" && paths.has(v)) it.data = { ...it.data, [k]: paths.get(v)! };
    }
    for (const h of history) for (const k of folderKeys) {
      const c = h.c.changes?.[k];
      if (c) h.c.changes = { ...h.c.changes, [k]: { from: paths.get(String(c.from)) ?? c.from, to: paths.get(String(c.to)) ?? c.to } };
    }
  }
  return {
    project, moduleKey, fields, ctx,
    items: items.map((i) => ({ ...i, updatedByName: i.updatedBy ? uname.get(i.updatedBy) ?? "" : "" })),
    history,
  };
}

export const MODULE_TITLE = {
  fa: { zh: "FA 项目进度管理表", en: "Deal Workplan", report: "FA 项目完成情况报告", item: "任务" },
  dd: { zh: "DD 材料信息收集进度表", en: "Due Diligence Request List", report: "DD 材料收集完成情况报告", item: "材料" },
  qa: { zh: "QA 问答进度跟踪表", en: "Q&A Tracker", report: "Q&A 问答完成情况报告", item: "问题" },
} as const;

export function fileStamp(d = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(d).replace(/[-: ]/g, "").slice(0, 12);
}
