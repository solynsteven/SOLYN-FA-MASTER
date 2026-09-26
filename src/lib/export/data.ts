import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { users, type FieldDefinition, type Project } from "@/db/schema";
import { listFields } from "@/lib/queries";
import { listItemsDerived, moduleHistory } from "@/lib/tracker";

export type ExportData = Awaited<ReturnType<typeof loadExportData>>;

export async function loadExportData(project: Project, moduleKey: "fa" | "dd", withHistory: boolean) {
  const fields: FieldDefinition[] = await listFields(project.id, moduleKey);
  const { items, ctx } = await listItemsDerived(project.id, moduleKey, fields);
  const ids = [...new Set(items.map((i) => i.updatedBy).filter(Boolean))] as string[];
  const names = ids.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : [];
  const uname = new Map(names.map((u) => [u.id, u.name]));
  const history = withHistory ? await moduleHistory(project.id, moduleKey, 3000) : [];
  return {
    project, moduleKey, fields, ctx,
    items: items.map((i) => ({ ...i, updatedByName: i.updatedBy ? uname.get(i.updatedBy) ?? "" : "" })),
    history,
  };
}

export const MODULE_TITLE = {
  fa: { zh: "FA 项目进度管理表", en: "Deal Workplan", report: "FA 项目完成情况报告", item: "任务" },
  dd: { zh: "DD 材料信息收集进度表", en: "Due Diligence Request List", report: "DD 材料收集完成情况报告", item: "材料" },
} as const;

export function fileStamp(d = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(d).replace(/[-: ]/g, "").slice(0, 12);
}
