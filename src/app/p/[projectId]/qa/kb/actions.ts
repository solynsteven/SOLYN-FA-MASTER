"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { qaAreas, qaDocs } from "@/db/schema";
import { assertProject, audit } from "@/lib/auth";
import { run } from "@/lib/action";
import { isQaGroup, QA_GROUPS } from "@/lib/qa/groups";
import { mdTitle } from "@/lib/qa/kb-core";

const MAX_MD = 2 * 1024 * 1024;

async function guard(projectId: string) {
  const a = await assertProject(projectId, true);
  if (!a.enabledModules.has("qa")) throw new Error("本项目未启用 Q&A 模块");
  return a;
}
const refresh = (projectId: string) => revalidatePath(`/p/${projectId}/qa`, "layout");

function checkGroup(g: string) {
  if (!isQaGroup(g)) throw new Error(`权限组须为 ${QA_GROUPS.join(" / ")}`);
  return g;
}

export async function createArea(projectId: string, input: { name: string; accessGroup: string; description?: string }) {
  return run(async () => {
    const a = await guard(projectId);
    const name = input.name.trim();
    if (!name) throw new Error("请填写文件区名称");
    const [r] = await db.select({ m: sql<number>`coalesce(max(${qaAreas.sortOrder}),0)::int` }).from(qaAreas).where(eq(qaAreas.projectId, projectId));
    const [row] = await db
      .insert(qaAreas)
      .values({ projectId, name: name.slice(0, 60), accessGroup: checkGroup(input.accessGroup), description: input.description?.trim() || null, sortOrder: (r?.m ?? 0) + 10, createdBy: a.user.id })
      .returning();
    await audit(a.user.id, "qa.area.create", { name, group: input.accessGroup }, projectId);
    refresh(projectId);
    return { id: row.id };
  }, "文件区已创建");
}

export async function updateArea(projectId: string, areaId: string, input: { name: string; accessGroup: string; description?: string }) {
  return run(async () => {
    const a = await guard(projectId);
    const [old] = await db.select().from(qaAreas).where(and(eq(qaAreas.id, areaId), eq(qaAreas.projectId, projectId)));
    if (!old) throw new Error("文件区不存在");
    const name = input.name.trim();
    if (!name) throw new Error("请填写文件区名称");
    await db
      .update(qaAreas)
      .set({ name: name.slice(0, 60), accessGroup: checkGroup(input.accessGroup), description: input.description?.trim() || null, updatedAt: new Date() })
      .where(eq(qaAreas.id, areaId));
    await audit(a.user.id, "qa.area.update", { name, from: old.accessGroup, to: input.accessGroup }, projectId);
    refresh(projectId);
  }, "已保存");
}

export async function deleteArea(projectId: string, areaId: string) {
  return run(async () => {
    const a = await guard(projectId);
    const [old] = await db.select().from(qaAreas).where(and(eq(qaAreas.id, areaId), eq(qaAreas.projectId, projectId)));
    if (!old) throw new Error("文件区不存在");
    const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(qaDocs).where(eq(qaDocs.areaId, areaId));
    await db.delete(qaAreas).where(eq(qaAreas.id, areaId));
    await audit(a.user.id, "qa.area.delete", { name: old.name, docs: n?.n ?? 0 }, projectId);
    refresh(projectId);
  }, "文件区已删除");
}

/** 上传 .md：同一文件区内同名文件视为新版本（覆盖正文，版本号 +1） */
export async function uploadDocs(projectId: string, fd: FormData) {
  return run(async () => {
    const a = await guard(projectId);
    const areaId = String(fd.get("areaId") ?? "");
    const [area] = await db.select().from(qaAreas).where(and(eq(qaAreas.id, areaId), eq(qaAreas.projectId, projectId)));
    if (!area) throw new Error("请选择文件区");
    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new Error("请选择 .md 文件");
    let created = 0, updated = 0;
    for (const f of files) {
      if (!/\.(md|markdown)$/i.test(f.name)) throw new Error(`「${f.name}」不是 .md 文件`);
      if (f.size > MAX_MD) throw new Error(`「${f.name}」超过 2MB`);
      const content = (await f.text()).replace(/^﻿/, "");
      const name = f.name.normalize("NFC");
      const title = mdTitle(content, name);
      const [ex] = await db.select().from(qaDocs).where(and(eq(qaDocs.areaId, areaId), eq(qaDocs.name, name)));
      if (ex) {
        await db.update(qaDocs).set({ content, title, size: f.size, version: ex.version + 1, uploadedBy: a.user.id, updatedAt: new Date() }).where(eq(qaDocs.id, ex.id));
        updated++;
      } else {
        const [r] = await db.select({ m: sql<number>`coalesce(max(${qaDocs.seq}),0)::int` }).from(qaDocs).where(eq(qaDocs.projectId, projectId));
        await db.insert(qaDocs).values({ projectId, areaId, seq: (r?.m ?? 0) + 1, name, title, content, size: f.size, uploadedBy: a.user.id });
        created++;
      }
      await audit(a.user.id, ex ? "qa.doc.update" : "qa.doc.upload", { name, area: area.name, size: f.size }, projectId);
    }
    refresh(projectId);
    return { created, updated };
  });
}

export async function moveDoc(projectId: string, docId: string, areaId: string) {
  return run(async () => {
    const a = await guard(projectId);
    const [doc] = await db.select().from(qaDocs).where(and(eq(qaDocs.id, docId), eq(qaDocs.projectId, projectId)));
    const [area] = await db.select().from(qaAreas).where(and(eq(qaAreas.id, areaId), eq(qaAreas.projectId, projectId)));
    if (!doc || !area) throw new Error("文件或文件区不存在");
    const [dup] = await db.select({ id: qaDocs.id }).from(qaDocs).where(and(eq(qaDocs.areaId, areaId), eq(qaDocs.name, doc.name)));
    if (dup && dup.id !== doc.id) throw new Error("目标文件区已有同名文件");
    await db.update(qaDocs).set({ areaId, updatedAt: new Date() }).where(eq(qaDocs.id, docId));
    await audit(a.user.id, "qa.doc.move", { name: doc.name, to: area.name }, projectId);
    refresh(projectId);
  }, "已移动");
}

export async function deleteDoc(projectId: string, docId: string) {
  return run(async () => {
    const a = await guard(projectId);
    const [doc] = await db.select().from(qaDocs).where(and(eq(qaDocs.id, docId), eq(qaDocs.projectId, projectId)));
    if (!doc) throw new Error("文件不存在");
    await db.delete(qaDocs).where(eq(qaDocs.id, docId));
    await audit(a.user.id, "qa.doc.delete", { name: doc.name }, projectId);
    refresh(projectId);
  }, "文件已删除");
}
