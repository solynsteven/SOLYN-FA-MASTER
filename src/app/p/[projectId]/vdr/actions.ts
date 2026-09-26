"use server";

import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, isNotNull, desc, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { vdrFolders, vdrFiles, vdrPermissions, vdrEvents, users, trackerItems } from "@/db/schema";
import type { VdrLevel, VdrGroup } from "@/db/schema";
import { assertProject } from "@/lib/auth";
import { run } from "@/lib/action";
import { loadViewer, loadVdr, makeResolver, setPhaseUnlocked, phaseIsOpen, faTaskStatuses } from "@/lib/vdr/access";
import { logVdr } from "@/lib/vdr/events";
import { deleteStored, headStored, storageMode, blobAccess } from "@/lib/vdr/storage";
import { atLeast, VDR_GROUPS } from "@/lib/vdr/constants";

async function guard(projectId: string, manage: boolean) {
  const a = await assertProject(projectId, manage);
  if (!a.enabledModules.has("vdr")) throw new Error("本项目未启用 VDR 模块");
  return a;
}
const refresh = (projectId: string) => {
  revalidatePath(`/p/${projectId}/vdr`, "layout");
  revalidatePath(`/p/${projectId}/settings`);
};
const cleanName = (s: string) => {
  const n = s.trim().replace(/[\\/:*?"<>|]/g, "_");
  if (!n) throw new Error("名称不能为空");
  if (n.length > 120) throw new Error("名称过长");
  return n;
};

/* ------------------------------ Phase 区 ------------------------------ */

type PhaseInput = { name: string; password?: string | null; openMode: "closed" | "open" | "by_task"; openTaskCode?: string | null; openTrigger?: "started" | "done" };

export async function createPhase(projectId: string, input: PhaseInput) {
  return run(async () => {
    const a = await guard(projectId, true);
    const siblings = await db.select({ s: vdrFolders.sortOrder }).from(vdrFolders).where(and(eq(vdrFolders.projectId, projectId), isNull(vdrFolders.parentId)));
    if (input.openMode === "by_task" && !input.openTaskCode) throw new Error("请选择用于判断开放的 FA 任务");
    const [p] = await db.insert(vdrFolders).values({
      projectId, parentId: null, isPhase: true, name: cleanName(input.name), sortOrder: Math.max(0, ...siblings.map((x) => x.s)) + 10,
      passwordHash: input.password ? await bcrypt.hash(input.password, 10) : null,
      openMode: input.openMode, openTaskCode: input.openTaskCode || null, openTrigger: input.openTrigger ?? "started", createdBy: a.user.id,
    }).returning();
    await logVdr(projectId, a.user.id, "phase_create", { folderId: p.id, detail: { name: p.name, openMode: p.openMode, password: !!input.password } });
    refresh(projectId);
    return { id: p.id };
  }, "Phase 区已创建");
}

export async function updatePhase(projectId: string, phaseId: string, input: PhaseInput & { changePassword: boolean }) {
  return run(async () => {
    const a = await guard(projectId, true);
    const [p] = await db.select().from(vdrFolders).where(and(eq(vdrFolders.id, phaseId), eq(vdrFolders.projectId, projectId)));
    if (!p || !p.isPhase) throw new Error("Phase 区不存在");
    if (input.openMode === "by_task" && !input.openTaskCode) throw new Error("请选择用于判断开放的 FA 任务");
    const patch: Partial<typeof vdrFolders.$inferInsert> = {
      name: cleanName(input.name), openMode: input.openMode, openTaskCode: input.openTaskCode || null, openTrigger: input.openTrigger ?? "started", updatedAt: new Date(),
    };
    if (input.changePassword) {
      patch.passwordHash = input.password ? await bcrypt.hash(input.password, 10) : null;
      patch.passwordVersion = p.passwordVersion + 1; // 已解锁的会话需重新输入
    }
    await db.update(vdrFolders).set(patch).where(eq(vdrFolders.id, phaseId));
    await logVdr(projectId, a.user.id, "phase_update", { folderId: phaseId, detail: { name: patch.name, openMode: patch.openMode, passwordChanged: input.changePassword } });
    refresh(projectId);
  }, "Phase 设置已保存");
}

export async function unlockPhase(projectId: string, phaseId: string, password: string) {
  return run(async () => {
    const a = await guard(projectId, false);
    const [p] = await db.select().from(vdrFolders).where(and(eq(vdrFolders.id, phaseId), eq(vdrFolders.projectId, projectId), isNull(vdrFolders.deletedAt)));
    if (!p || !p.isPhase) throw new Error("Phase 区不存在");
    if (!a.canManage && !phaseIsOpen(p, await faTaskStatuses(projectId))) throw new Error("该 Phase 区尚未开放");
    if (!p.passwordHash) return;
    if (!(await bcrypt.compare(password, p.passwordHash))) {
      await new Promise((r) => setTimeout(r, 500));
      await logVdr(projectId, a.user.id, "phase_unlock", { folderId: phaseId, detail: { ok: false } });
      throw new Error("密码不正确");
    }
    await setPhaseUnlocked(p, a.user.id);
    await logVdr(projectId, a.user.id, "phase_unlock", { folderId: phaseId, detail: { ok: true } });
    refresh(projectId);
  });
}

/* ------------------------------ 目录 ------------------------------ */

export async function createFolder(projectId: string, parentId: string, name: string) {
  return run(async () => {
    const a = await guard(projectId, true);
    const [parent] = await db.select().from(vdrFolders).where(and(eq(vdrFolders.id, parentId), eq(vdrFolders.projectId, projectId), isNull(vdrFolders.deletedAt)));
    if (!parent) throw new Error("上级目录不存在");
    const n = cleanName(name);
    const sib = await db.select({ name: vdrFolders.name, s: vdrFolders.sortOrder }).from(vdrFolders).where(and(eq(vdrFolders.parentId, parentId), isNull(vdrFolders.deletedAt)));
    if (sib.some((x) => x.name === n)) throw new Error("同级已存在同名目录");
    const [f] = await db.insert(vdrFolders).values({ projectId, parentId, name: n, sortOrder: Math.max(0, ...sib.map((x) => x.s)) + 10, createdBy: a.user.id }).returning();
    await logVdr(projectId, a.user.id, "folder_create", { folderId: f.id, detail: { name: n, parentId } });
    refresh(projectId);
    return { id: f.id };
  }, "目录已创建");
}

export async function renameFolder(projectId: string, folderId: string, name: string) {
  return run(async () => {
    const a = await guard(projectId, true);
    const [f] = await db.select().from(vdrFolders).where(and(eq(vdrFolders.id, folderId), eq(vdrFolders.projectId, projectId)));
    if (!f) throw new Error("目录不存在");
    const n = cleanName(name);
    await db.update(vdrFolders).set({ name: n, updatedAt: new Date() }).where(eq(vdrFolders.id, folderId));
    await logVdr(projectId, a.user.id, "folder_rename", { folderId, detail: { from: f.name, to: n } });
    refresh(projectId);
  }, "已重命名");
}

/** 删除目录：连同所有下级目录与文件一起移入回收站（同一批次，可整体恢复） */
export async function deleteFolder(projectId: string, folderId: string) {
  return run(async () => {
    const a = await guard(projectId, true);
    const { folders, files } = await loadVdr(projectId);
    const root = folders.find((f) => f.id === folderId);
    if (!root) throw new Error("目录不存在");
    const ids = new Set([folderId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of folders) if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) { ids.add(f.id); grew = true; }
    }
    const batch = randomUUID();
    const now = new Date();
    const fileIds = files.filter((x) => ids.has(x.folderId)).map((x) => x.id);
    await db.update(vdrFolders).set({ deletedAt: now, deletedBy: a.user.id, deleteBatch: batch }).where(inArray(vdrFolders.id, [...ids]));
    if (fileIds.length) await db.update(vdrFiles).set({ deletedAt: now, deletedBy: a.user.id, deleteBatch: batch }).where(inArray(vdrFiles.id, fileIds));
    await logVdr(projectId, a.user.id, "folder_delete", { folderId, detail: { name: root.name, folders: ids.size, files: fileIds.length, batch } });
    refresh(projectId);
  }, "目录已移入回收站（可在「项目管理 → VDR 回收站」恢复）");
}

/* ------------------------------ 文件 ------------------------------ */

async function validateCodes(projectId: string, taskCode?: string | null, ddCode?: string | null) {
  const check = async (mk: "fa" | "dd", code: string, label: string) => {
    const rows = await db.select({ id: trackerItems.id }).from(trackerItems)
      .where(and(eq(trackerItems.projectId, projectId), eq(trackerItems.moduleKey, mk), eq(trackerItems.externalKey, code), isNull(trackerItems.deletedAt))).limit(1);
    if (!rows.length) throw new Error(`${label}「${code}」不存在`);
  };
  if (taskCode) await check("fa", taskCode, "项目任务编码");
  if (ddCode) await check("dd", ddCode, "材料编码");
}

export type RegisterInput = { folderId: string; name: string; key: string; size: number; contentType: string | null; taskCode?: string | null; ddCode?: string | null; description?: string | null };

/** Vercel Blob 直传完成后登记文件（服务器再次核验存储中的对象） */
export async function registerFile(projectId: string, input: RegisterInput) {
  return run(async () => {
    const a = await guard(projectId, true);
    if (storageMode() !== "blob") throw new Error("当前未启用 Vercel Blob");
    if (!input.key.includes(`vdr/${projectId}/`)) throw new Error("非法的存储路径");
    const [folder] = await db.select().from(vdrFolders).where(and(eq(vdrFolders.id, input.folderId), eq(vdrFolders.projectId, projectId), isNull(vdrFolders.deletedAt)));
    if (!folder) throw new Error("目录不存在");
    await validateCodes(projectId, input.taskCode, input.ddCode);
    const h = await headStored(input.key);
    const [f] = await db.insert(vdrFiles).values({
      projectId, folderId: input.folderId, name: cleanName(input.name), size: h.size, contentType: h.contentType || input.contentType,
      storage: "blob", storageKey: blobAccess === "private" ? h.pathname : h.url, taskCode: input.taskCode || null, ddCode: input.ddCode || null,
      description: input.description || null, uploadedBy: a.user.id,
    }).returning();
    await logVdr(projectId, a.user.id, "upload", { fileId: f.id, folderId: f.folderId, detail: { name: f.name, size: f.size } });
    refresh(projectId);
    return { id: f.id };
  });
}

export async function updateFile(projectId: string, fileId: string, input: { name: string; taskCode?: string | null; ddCode?: string | null; description?: string | null }) {
  return run(async () => {
    const a = await guard(projectId, true);
    const [f] = await db.select().from(vdrFiles).where(and(eq(vdrFiles.id, fileId), eq(vdrFiles.projectId, projectId)));
    if (!f) throw new Error("文件不存在");
    await validateCodes(projectId, input.taskCode, input.ddCode);
    const patch = { name: cleanName(input.name), taskCode: input.taskCode || null, ddCode: input.ddCode || null, description: input.description || null };
    await db.update(vdrFiles).set({ ...patch, updatedAt: new Date() }).where(eq(vdrFiles.id, fileId));
    await logVdr(projectId, a.user.id, "file_update", { fileId, folderId: f.folderId, detail: { from: { name: f.name, taskCode: f.taskCode, ddCode: f.ddCode }, to: patch } });
    refresh(projectId);
  }, "文件信息已保存");
}

export async function deleteFile(projectId: string, fileId: string) {
  return run(async () => {
    const a = await guard(projectId, true);
    const [f] = await db.select().from(vdrFiles).where(and(eq(vdrFiles.id, fileId), eq(vdrFiles.projectId, projectId), isNull(vdrFiles.deletedAt)));
    if (!f) throw new Error("文件不存在");
    await db.update(vdrFiles).set({ deletedAt: new Date(), deletedBy: a.user.id, deleteBatch: randomUUID() }).where(eq(vdrFiles.id, fileId));
    await logVdr(projectId, a.user.id, "delete", { fileId, folderId: f.folderId, detail: { name: f.name } });
    refresh(projectId);
  }, "文件已移入回收站");
}

/** 记录打印（需 P 级及以上） */
export async function logPrint(projectId: string, fileId: string) {
  return run(async () => {
    const a = await guard(projectId, false);
    const viewer = await loadViewer(projectId, a.user.id, a.canManage);
    const { folders, files, perms } = await loadVdr(projectId);
    const f = files.find((x) => x.id === fileId);
    if (!f) throw new Error("文件不存在");
    const lv = makeResolver(folders, perms, viewer).fileLevel(f);
    if (!atLeast(lv, "P")) throw new Error("无打印权限");
    await logVdr(projectId, a.user.id, "print", { fileId, folderId: f.folderId, detail: { name: f.name } });
  });
}

/* ------------------------------ 权限 ------------------------------ */

export type PermEntry = { subjectType: "group" | "user"; subject: string; level: VdrLevel | null };

/** 覆盖设置某个目录 / 文件上的全部权限条目；level = null 表示“继承上级” */
export async function setPermissions(projectId: string, targetType: "folder" | "file", targetId: string, entries: PermEntry[]) {
  return run(async () => {
    const a = await guard(projectId, true);
    const table = targetType === "folder" ? vdrFolders : vdrFiles;
    const [t] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, targetId), eq(table.projectId, projectId)));
    if (!t) throw new Error("对象不存在");
    const valid = entries.filter((e) => e.level && (e.subjectType === "user" || VDR_GROUPS.some((g) => g.code === e.subject)));
    await db.delete(vdrPermissions).where(and(eq(vdrPermissions.targetType, targetType), eq(vdrPermissions.targetId, targetId)));
    if (valid.length)
      await db.insert(vdrPermissions).values(valid.map((e) => ({ projectId, targetType, targetId, subjectType: e.subjectType, subject: e.subject, level: e.level!, updatedBy: a.user.id })));
    await logVdr(projectId, a.user.id, "permission", {
      [targetType === "folder" ? "folderId" : "fileId"]: targetId,
      detail: { targetType, entries: valid.map((e) => `${e.subjectType === "group" ? e.subject : "用户"}:${e.level}`) },
    });
    refresh(projectId);
  }, "权限已保存");
}

/* ------------------------------ 操作记录 ------------------------------ */

export async function folderLog(projectId: string, folderId: string) {
  return run(async () => {
    await guard(projectId, true);
    const fileIds = (await db.select({ id: vdrFiles.id }).from(vdrFiles).where(eq(vdrFiles.folderId, folderId))).map((x) => x.id);
    const rows = await db
      .select({ e: vdrEvents, name: users.name, fileName: vdrFiles.name })
      .from(vdrEvents)
      .leftJoin(users, eq(users.id, vdrEvents.userId))
      .leftJoin(vdrFiles, eq(vdrFiles.id, vdrEvents.fileId))
      .where(and(eq(vdrEvents.projectId, projectId), fileIds.length ? or(eq(vdrEvents.folderId, folderId), inArray(vdrEvents.fileId, fileIds)) : eq(vdrEvents.folderId, folderId)))
      .orderBy(desc(vdrEvents.createdAt))
      .limit(300);
    return rows.map(({ e, name, fileName }) => ({ id: e.id, action: e.action, at: e.createdAt.toISOString(), user: name ?? "—", file: fileName ?? (e.detail?.name as string | undefined) ?? "", detail: e.detail }));
  });
}

/* ------------------------------ 回收站 ------------------------------ */

export async function restoreFile(projectId: string, fileId: string) {
  return run(async () => {
    const a = await guard(projectId, true);
    const [f] = await db.select().from(vdrFiles).where(and(eq(vdrFiles.id, fileId), eq(vdrFiles.projectId, projectId), isNotNull(vdrFiles.deletedAt)));
    if (!f) throw new Error("文件不在回收站中");
    const [folder] = await db.select().from(vdrFolders).where(eq(vdrFolders.id, f.folderId));
    if (!folder || folder.deletedAt) throw new Error("所在目录已被删除，请先恢复目录");
    await db.update(vdrFiles).set({ deletedAt: null, deletedBy: null, deleteBatch: null, updatedAt: new Date() }).where(eq(vdrFiles.id, fileId));
    await logVdr(projectId, a.user.id, "restore", { fileId, folderId: f.folderId, detail: { name: f.name } });
    refresh(projectId);
  }, "文件已恢复");
}

export async function purgeFile(projectId: string, fileId: string) {
  return run(async () => {
    const a = await guard(projectId, true);
    const [f] = await db.select().from(vdrFiles).where(and(eq(vdrFiles.id, fileId), eq(vdrFiles.projectId, projectId), isNotNull(vdrFiles.deletedAt)));
    if (!f) throw new Error("文件不在回收站中");
    await deleteStored(f.storage, f.storageKey).catch(() => null);
    await db.delete(vdrPermissions).where(and(eq(vdrPermissions.targetType, "file"), eq(vdrPermissions.targetId, fileId)));
    await db.delete(vdrFiles).where(eq(vdrFiles.id, fileId));
    await logVdr(projectId, a.user.id, "purge", { fileId, folderId: f.folderId, detail: { name: f.name, size: f.size } });
    refresh(projectId);
  }, "已彻底删除");
}

export async function restoreFolder(projectId: string, folderId: string) {
  return run(async () => {
    const a = await guard(projectId, true);
    const [f] = await db.select().from(vdrFolders).where(and(eq(vdrFolders.id, folderId), eq(vdrFolders.projectId, projectId), isNotNull(vdrFolders.deletedAt)));
    if (!f || !f.deleteBatch) throw new Error("目录不在回收站中");
    if (f.parentId) {
      const [p] = await db.select().from(vdrFolders).where(eq(vdrFolders.id, f.parentId));
      if (!p || p.deletedAt) throw new Error("上级目录已被删除，请先恢复上级目录");
    }
    const b = f.deleteBatch;
    await db.update(vdrFolders).set({ deletedAt: null, deletedBy: null, deleteBatch: null }).where(eq(vdrFolders.deleteBatch, b));
    await db.update(vdrFiles).set({ deletedAt: null, deletedBy: null, deleteBatch: null }).where(eq(vdrFiles.deleteBatch, b));
    await logVdr(projectId, a.user.id, "folder_restore", { folderId, detail: { name: f.name } });
    refresh(projectId);
  }, "目录已恢复（含其中的文件）");
}

export async function purgeFolder(projectId: string, folderId: string) {
  return run(async () => {
    const a = await guard(projectId, true);
    const [f] = await db.select().from(vdrFolders).where(and(eq(vdrFolders.id, folderId), eq(vdrFolders.projectId, projectId), isNotNull(vdrFolders.deletedAt)));
    if (!f || !f.deleteBatch) throw new Error("目录不在回收站中");
    const fs = await db.select().from(vdrFiles).where(eq(vdrFiles.deleteBatch, f.deleteBatch));
    const folders = await db.select({ id: vdrFolders.id }).from(vdrFolders).where(eq(vdrFolders.deleteBatch, f.deleteBatch));
    for (const x of fs) await deleteStored(x.storage, x.storageKey).catch(() => null);
    const targetIds = [...fs.map((x) => x.id), ...folders.map((x) => x.id)];
    if (targetIds.length) await db.delete(vdrPermissions).where(inArray(vdrPermissions.targetId, targetIds));
    if (fs.length) await db.delete(vdrFiles).where(inArray(vdrFiles.id, fs.map((x) => x.id)));
    await db.delete(vdrFolders).where(inArray(vdrFolders.id, folders.map((x) => x.id)));
    await logVdr(projectId, a.user.id, "folder_purge", { folderId, detail: { name: f.name, folders: folders.length, files: fs.length } });
    refresh(projectId);
  }, "已彻底删除目录及其中文件");
}

export async function isPhaseOpenFor(projectId: string, phaseId: string) {
  const [p] = await db.select().from(vdrFolders).where(eq(vdrFolders.id, phaseId));
  return p ? phaseIsOpen(p, await faTaskStatuses(projectId)) : false;
}
export type { VdrGroup };
