"use server";

import bcrypt from "bcryptjs";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { users, projects, projectMembers, projectModules, fieldDefinitions, trackerItems } from "@/db/schema";
import type { FieldType, FieldRole } from "@/db/schema";
import { assertProject, audit } from "@/lib/auth";
import { run } from "@/lib/action";
import { MODULES, isTrackerModule } from "@/lib/modules";
import { hasOptions, slugKey } from "@/lib/fields";
import { seedDefaultFields } from "@/lib/project-service";

const refresh = (id: string) => revalidatePath(`/p/${id}`, "layout");

/* --------------------------- 基本信息 / 模块 --------------------------- */

export async function updateProjectInfo(projectId: string, input: { name: string; clientName: string; dealType: string; description: string }) {
  return run(async () => {
    const a = await assertProject(projectId, true);
    if (!input.name.trim()) throw new Error("项目名称不能为空");
    await db.update(projects).set({
      name: input.name.trim(), clientName: input.clientName.trim() || null, dealType: input.dealType.trim() || null,
      description: input.description.trim() || null, updatedAt: new Date(),
    }).where(eq(projects.id, projectId));
    await audit(a.user.id, "project.update", input, projectId);
    refresh(projectId);
  }, "已保存");
}

export async function setProjectModules(projectId: string, enabled: string[]) {
  return run(async () => {
    const a = await assertProject(projectId, true);
    for (const m of MODULES) {
      await db
        .insert(projectModules)
        .values({ projectId, moduleKey: m.key, enabled: enabled.includes(m.key) })
        .onConflictDoUpdate({ target: [projectModules.projectId, projectModules.moduleKey], set: { enabled: enabled.includes(m.key), updatedAt: new Date() } });
    }
    await audit(a.user.id, "project.modules", { enabled }, projectId);
    refresh(projectId);
  }, "模块设置已保存");
}

/* ------------------------------- 成员 ------------------------------- */

const addSchema = z.object({
  email: z.string().trim().toLowerCase().email("邮箱格式不正确"),
  role: z.enum(["project_admin", "member"]),
  name: z.string().trim().optional(),
  password: z.string().optional(),
});

export async function addMember(projectId: string, input: z.input<typeof addSchema>) {
  return run(async () => {
    const a = await assertProject(projectId, true);
    const d = addSchema.parse(input);
    let [u] = await db.select().from(users).where(eq(users.email, d.email));
    if (!u) {
      if (!d.name || !d.password) throw new Error("NEED_CREATE");
      if (d.password.length < 8) throw new Error("初始密码至少 8 位");
      [u] = await db.insert(users).values({ email: d.email, name: d.name, passwordHash: await bcrypt.hash(d.password, 10) }).returning();
      await audit(a.user.id, "user.create", { email: u.email, via: "project" }, projectId);
    }
    if (u.globalRole === "super_admin") throw new Error("该用户是全局管理员，已可访问全部项目");
    const [exists] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, u.id)));
    if (exists) throw new Error("该用户已在项目中");
    await db.insert(projectMembers).values({ projectId, userId: u.id, role: d.role });
    await audit(a.user.id, "member.add", { email: u.email, role: d.role }, projectId);
    refresh(projectId);
  }, "成员已添加");
}

export async function updateMemberRole(projectId: string, userId: string, role: "project_admin" | "member") {
  return run(async () => {
    const a = await assertProject(projectId, true);
    if (userId === a.user.id && a.role === "project_admin" && role !== "project_admin") throw new Error("不能降级自己的项目管理员权限");
    await db.update(projectMembers).set({ role }).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    await audit(a.user.id, "member.update", { userId, role }, projectId);
    refresh(projectId);
  }, "角色已更新");
}

export async function removeMember(projectId: string, userId: string) {
  return run(async () => {
    const a = await assertProject(projectId, true);
    if (userId === a.user.id) throw new Error("不能将自己移出项目");
    await db.delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    await audit(a.user.id, "member.remove", { userId }, projectId);
    refresh(projectId);
  }, "成员已移除");
}

/* ------------------------------- 字段 ------------------------------- */

const TYPES = ["text", "longtext", "number", "percent", "date", "select", "multiselect", "boolean", "user"] as const;
const ROLES = ["code", "title", "category", "priority", "status", "owner", "due_date", "start_date", "progress", "access"] as const;

const fieldSchema = z.object({
  label: z.string().trim().min(1, "请填写字段名称").max(40),
  type: z.enum(TYPES),
  options: z.array(z.string().trim().min(1)).default([]),
  role: z.enum(ROLES).nullable().default(null),
  required: z.boolean().default(false),
  showInTable: z.boolean().default(true),
  width: z.number().int().min(60).max(600).default(160),
  aliases: z.array(z.string().trim().min(1)).default([]),
  config: z.object({ levelParents: z.record(z.string(), z.string().nullable()).optional() }).default({}),
});
export type FieldInputT = z.input<typeof fieldSchema>;

async function guardField(projectId: string, moduleKey: string) {
  if (!isTrackerModule(moduleKey)) throw new Error("该模块不支持自定义字段");
  return assertProject(projectId, true);
}

async function clearRole(projectId: string, moduleKey: string, role: FieldRole, exceptId?: string) {
  if (!role) return;
  // 同一模块内每个语义角色只能指派给一个字段
  await db.update(fieldDefinitions).set({ role: null })
    .where(and(eq(fieldDefinitions.projectId, projectId), eq(fieldDefinitions.moduleKey, moduleKey), eq(fieldDefinitions.role, role),
      exceptId ? sql`${fieldDefinitions.id} <> ${exceptId}` : undefined));
}

function checkLevelParents(d: { options: string[]; config: { levelParents?: Record<string, string | null> } }) {
  const lp = d.config.levelParents;
  if (!lp) return;
  for (const [lv, parent] of Object.entries(lp)) {
    if (!d.options.includes(lv)) delete lp[lv];
    else if (parent && !d.options.includes(parent)) throw new Error(`「${lv}」的上级等级「${parent}」不在选项中`);
    else if (parent === lv) throw new Error(`「${lv}」不能从属于自己`);
  }
  for (const lv of Object.keys(lp)) {
    const seen = new Set<string>();
    let cur: string | null | undefined = lv;
    while (cur) {
      if (seen.has(cur)) throw new Error("任务等级的从属关系出现循环，请检查");
      seen.add(cur);
      cur = lp[cur];
    }
  }
  if (!Object.values(lp).some((v) => v === null) && Object.keys(lp).length) throw new Error("至少需要一个顶级等级（无上级）");
}

export async function createField(projectId: string, moduleKey: string, input: FieldInputT) {
  return run(async () => {
    const a = await guardField(projectId, moduleKey);
    const d = fieldSchema.parse(input);
    if (hasOptions(d.type as FieldType) && d.options.length === 0) throw new Error("下拉列表字段至少需要一个选项");
    checkLevelParents(d);
    const existing = await db.select({ key: fieldDefinitions.key, label: fieldDefinitions.label, sortOrder: fieldDefinitions.sortOrder })
      .from(fieldDefinitions).where(and(eq(fieldDefinitions.projectId, projectId), eq(fieldDefinitions.moduleKey, moduleKey)));
    if (existing.some((e) => e.label === d.label)) throw new Error("已存在同名字段");
    const key = slugKey(d.label.match(/[a-z0-9]/i) ? d.label : `f_${Date.now().toString(36)}`, existing.map((e) => e.key));
    await clearRole(projectId, moduleKey, d.role);
    await db.insert(fieldDefinitions).values({
      projectId, moduleKey, key, ...d, options: hasOptions(d.type as FieldType) ? [...new Set(d.options)] : [],
      sortOrder: Math.max(0, ...existing.map((e) => e.sortOrder)) + 10,
    });
    await audit(a.user.id, "field.create", { moduleKey, label: d.label, type: d.type }, projectId);
    refresh(projectId);
  }, "字段已新增");
}

export async function updateField(projectId: string, fieldId: string, input: FieldInputT) {
  return run(async () => {
    const [f] = await db.select().from(fieldDefinitions).where(eq(fieldDefinitions.id, fieldId));
    if (!f || f.projectId !== projectId) throw new Error("字段不存在");
    const a = await guardField(projectId, f.moduleKey);
    const d = fieldSchema.parse(input);
    if (hasOptions(d.type as FieldType) && d.options.length === 0) throw new Error("下拉列表字段至少需要一个选项");
    checkLevelParents(d);
    const [dup] = await db.select({ id: fieldDefinitions.id }).from(fieldDefinitions)
      .where(and(eq(fieldDefinitions.projectId, projectId), eq(fieldDefinitions.moduleKey, f.moduleKey), eq(fieldDefinitions.label, d.label), sql`${fieldDefinitions.id} <> ${fieldId}`));
    if (dup) throw new Error("已存在同名字段");
    await clearRole(projectId, f.moduleKey, d.role, fieldId);
    await db.update(fieldDefinitions).set({ ...d, options: hasOptions(d.type as FieldType) ? [...new Set(d.options)] : [], updatedAt: new Date() }).where(eq(fieldDefinitions.id, fieldId));
    await audit(a.user.id, "field.update", { moduleKey: f.moduleKey, key: f.key, from: { label: f.label, type: f.type }, to: { label: d.label, type: d.type } }, projectId);
    refresh(projectId);
  }, "字段已保存");
}

export async function deleteField(projectId: string, fieldId: string) {
  return run(async () => {
    const [f] = await db.select().from(fieldDefinitions).where(eq(fieldDefinitions.id, fieldId));
    if (!f || f.projectId !== projectId) throw new Error("字段不存在");
    const a = await guardField(projectId, f.moduleKey);
    // 字段删除后，历史数据仍保留在记录的 data 中（不再显示），重新创建同 key 字段可找回
    await db.delete(fieldDefinitions).where(eq(fieldDefinitions.id, fieldId));
    await audit(a.user.id, "field.delete", { moduleKey: f.moduleKey, key: f.key, label: f.label }, projectId);
    refresh(projectId);
  }, "字段已删除");
}

export async function reorderFields(projectId: string, moduleKey: string, ids: string[]) {
  return run(async () => {
    const a = await guardField(projectId, moduleKey);
    for (let i = 0; i < ids.length; i++) {
      await db.update(fieldDefinitions).set({ sortOrder: (i + 1) * 10 })
        .where(and(eq(fieldDefinitions.id, ids[i]), eq(fieldDefinitions.projectId, projectId)));
    }
    await audit(a.user.id, "field.reorder", { moduleKey }, projectId);
    refresh(projectId);
  });
}

export async function resetFields(projectId: string, moduleKey: string) {
  return run(async () => {
    const a = await guardField(projectId, moduleKey);
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(trackerItems)
      .where(and(eq(trackerItems.projectId, projectId), eq(trackerItems.moduleKey, moduleKey), isNull(trackerItems.deletedAt)));
    if ((r?.n ?? 0) > 0) throw new Error("模块内已有记录，不能重置字段模板");
    await db.delete(fieldDefinitions).where(and(eq(fieldDefinitions.projectId, projectId), eq(fieldDefinitions.moduleKey, moduleKey)));
    await seedDefaultFields(projectId, moduleKey as "fa" | "dd" | "qa");
    await audit(a.user.id, "field.reset", { moduleKey }, projectId);
    refresh(projectId);
  }, "已恢复默认字段");
}

/* ------------------------------- VDR 成员属性 ------------------------------- */

export async function updateMemberVdr(projectId: string, userId: string, input: { group: string | null; organization: string | null }) {
  return run(async () => {
    const a = await assertProject(projectId, true);
    const groups = ["ADM", "SEL", "BID1", "BID2", "EXC", "DD"];
    if (input.group && !groups.includes(input.group)) throw new Error("未知权限组");
    await db.update(projectMembers).set({
      vdrGroup: (input.group || null) as (typeof projectMembers.$inferInsert)["vdrGroup"], organization: input.organization?.trim() || null,
    }).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    await audit(a.user.id, "member.vdr", { userId, ...input }, projectId);
    refresh(projectId);
  }, "已保存");
}
