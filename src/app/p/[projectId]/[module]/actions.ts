"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { assertProject, audit } from "@/lib/auth";
import { run } from "@/lib/action";
import { isTrackerModule } from "@/lib/modules";
import * as T from "@/lib/tracker";
import { qaViewer, canSee } from "@/lib/qa/access";

async function guard(projectId: string, moduleKey: string, manage: boolean) {
  if (!isTrackerModule(moduleKey)) throw new Error("未知模块");
  const a = await assertProject(projectId, manage);
  if (!a.enabledModules.has(moduleKey)) throw new Error("本项目未启用该模块");
  return a;
}

function refresh(projectId: string, moduleKey: string) {
  revalidatePath(`/p/${projectId}/${moduleKey}`);
  revalidatePath(`/p/${projectId}`);
}

export async function createItemAction(projectId: string, moduleKey: string, data: Record<string, unknown>) {
  return run(async () => {
    const a = await guard(projectId, moduleKey, true);
    const it = await T.createItem(projectId, moduleKey, data, a.user.id);
    refresh(projectId, moduleKey);
    return { id: it.id };
  }, "已新增");
}

export async function updateItemAction(projectId: string, moduleKey: string, itemId: string, data: Record<string, unknown>) {
  return run(async () => {
    const a = await guard(projectId, moduleKey, true);
    const it = await T.getItem(itemId);
    if (!it || it.projectId !== projectId || it.moduleKey !== moduleKey) throw new Error("记录不存在");
    const r = await T.updateItem(itemId, data, a.user.id);
    refresh(projectId, moduleKey);
    return { changed: r.changed };
  }, "已保存");
}

export async function deleteItemsAction(projectId: string, moduleKey: string, ids: string[]) {
  return run(async () => {
    const a = await guard(projectId, moduleKey, true);
    const n = await T.softDeleteItems(ids, a.user.id);
    refresh(projectId, moduleKey);
    return { n };
  }, "已删除（可在变更记录中恢复）");
}

export async function restoreItemAction(projectId: string, moduleKey: string, itemId: string) {
  return run(async () => {
    const a = await guard(projectId, moduleKey, true);
    const it = await T.getItem(itemId);
    if (!it || it.projectId !== projectId) throw new Error("记录不存在");
    await T.restoreItem(itemId, a.user.id);
    refresh(projectId, moduleKey);
    revalidatePath(`/p/${projectId}/${moduleKey}/history`);
  }, "已恢复");
}

export async function itemHistoryAction(projectId: string, moduleKey: string, itemId: string) {
  return run(async () => {
    await guard(projectId, moduleKey, false);
    const it = await T.getItem(itemId);
    if (!it || it.projectId !== projectId) throw new Error("记录不存在");
    if (moduleKey === "qa") {
      const v = await qaViewer(projectId);
      if (!v || !canSee(v.rank, it.data.access_group)) throw new Error("无权查看该记录");
    }
    const rows = await T.itemHistory(itemId);
    return rows.map(({ c, actor }) => ({
      id: c.id, action: c.action, source: c.source, changes: c.changes, actor: actor ?? "—", at: c.createdAt.toISOString(),
    }));
  });
}

export async function setFaStartDate(projectId: string, date: string | null) {
  return run(async () => {
    const a = await assertProject(projectId, true);
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("日期格式不正确");
    await db
      .update(projects)
      .set({ settings: { ...a.project.settings, faStartDate: date }, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
    await audit(a.user.id, "project.fa_start_date", { from: a.project.settings?.faStartDate ?? null, to: date }, projectId);
    refresh(projectId, "fa");
  }, "项目开始日已更新");
}
