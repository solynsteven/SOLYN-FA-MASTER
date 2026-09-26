"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { qaChats, trackerItems } from "@/db/schema";
import { run } from "@/lib/action";
import { audit } from "@/lib/auth";
import { qaViewer, canSee } from "@/lib/qa/access";
import { loadChat, ensureSummary } from "@/lib/qa/chats";
import { listFields } from "@/lib/queries";

async function viewerOrThrow(projectId: string) {
  const v = await qaViewer(projectId);
  if (!v || v.rank === 0) throw new Error("你没有 Q&A 模块的访问权限");
  return v;
}

export async function renameChat(projectId: string, chatId: string, title: string) {
  return run(async () => {
    const v = await viewerOrThrow(projectId);
    const t = title.trim().slice(0, 60);
    if (!t) throw new Error("请填写标题");
    await db.update(qaChats).set({ title: t }).where(and(eq(qaChats.id, chatId), eq(qaChats.projectId, projectId), eq(qaChats.userId, v.userId)));
    revalidatePath(`/p/${projectId}/qa/ai`);
  });
}

export async function deleteChat(projectId: string, chatId: string) {
  return run(async () => {
    const v = await viewerOrThrow(projectId);
    const c = await loadChat(projectId, chatId, v);
    if (!c) throw new Error("对话不存在");
    if (c.chat.userId !== v.userId && !v.isManager) throw new Error("只能删除自己的对话");
    await db.delete(qaChats).where(eq(qaChats.id, chatId));
    await audit(v.userId, "qa.ai.delete_chat", { title: c.chat.title, owner: c.owner }, projectId);
    revalidatePath(`/p/${projectId}/qa/ai`);
  }, "对话已删除");
}

export async function summarizeChat(projectId: string, chatId: string, force = false) {
  return run(async () => {
    const v = await viewerOrThrow(projectId);
    const c = await loadChat(projectId, chatId, v);
    if (!c) throw new Error("对话不存在");
    const summary = await ensureSummary(c, force);
    return { summary, at: c.chat.summaryAt?.toISOString() ?? null };
  });
}

/** 引用中的 Q&A 记录：按当前权限重新校验后返回 */
export async function getQaRecord(projectId: string, itemId: string) {
  return run(async () => {
    const v = await viewerOrThrow(projectId);
    const [it] = await db.select().from(trackerItems).where(and(eq(trackerItems.id, itemId), eq(trackerItems.projectId, projectId), eq(trackerItems.moduleKey, "qa")));
    if (!it || it.deletedAt) throw new Error("该 Q&A 记录已被删除");
    if (!canSee(v.rank, it.data.access_group)) throw new Error("你当前的权限组无权查看该记录");
    const fields = await listFields(projectId, "qa");
    return { id: it.id, data: it.data, updatedAt: it.updatedAt.toISOString(), fields: fields.map((f) => ({ key: f.key, label: f.label, type: f.type, role: f.role })) };
  });
}
