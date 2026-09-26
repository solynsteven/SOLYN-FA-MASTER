"use server";

import bcrypt from "bcryptjs";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { users, projects, projectMembers, projectModules, apiKeys } from "@/db/schema";
import { assertSuperAdmin, audit } from "@/lib/auth";
import { run } from "@/lib/action";
import { encrypt, decrypt } from "@/lib/crypto";
import { createProjectWithDefaults } from "@/lib/project-service";
import { listModels } from "@/lib/anthropic";

/* ============================== 用户 ============================== */

const userSchema = z.object({
  name: z.string().trim().min(1, "请输入姓名"),
  email: z.string().trim().toLowerCase().email("邮箱格式不正确"),
  title: z.string().trim().optional(),
  globalRole: z.enum(["super_admin", "user"]),
});

export async function createUser(input: z.input<typeof userSchema> & { password: string; projectId?: string; projectRole?: "project_admin" | "member" }) {
  return run(async () => {
    const me = await assertSuperAdmin();
    const d = userSchema.parse(input);
    if (!input.password || input.password.length < 8) throw new Error("初始密码至少 8 位");
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, d.email));
    if (exists) throw new Error("该邮箱已存在");
    const [u] = await db
      .insert(users)
      .values({ ...d, title: d.title || null, passwordHash: await bcrypt.hash(input.password, 10) })
      .returning();
    if (input.projectId) await db.insert(projectMembers).values({ projectId: input.projectId, userId: u.id, role: input.projectRole ?? "member" });
    await audit(me.id, "user.create", { email: u.email, globalRole: u.globalRole });
    revalidatePath("/admin/users");
  }, "用户已创建");
}

async function superAdminCount(excludeId?: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.globalRole, "super_admin"), eq(users.isActive, true), excludeId ? ne(users.id, excludeId) : undefined));
  return r?.n ?? 0;
}

export async function updateUser(id: string, input: z.input<typeof userSchema> & { isActive: boolean }) {
  return run(async () => {
    const me = await assertSuperAdmin();
    const d = userSchema.parse(input);
    if ((d.globalRole !== "super_admin" || !input.isActive) && (await superAdminCount(id)) === 0) {
      const [cur] = await db.select().from(users).where(eq(users.id, id));
      if (cur?.globalRole === "super_admin") throw new Error("系统至少需要保留一名启用状态的全局管理员");
    }
    const [dup] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, d.email), ne(users.id, id)));
    if (dup) throw new Error("该邮箱已被其他用户使用");
    await db.update(users).set({ ...d, title: d.title || null, isActive: input.isActive, updatedAt: new Date() }).where(eq(users.id, id));
    await audit(me.id, "user.update", { id, ...d, isActive: input.isActive });
    revalidatePath("/admin/users");
  }, "已保存");
}

export async function resetPassword(id: string, password: string) {
  return run(async () => {
    const me = await assertSuperAdmin();
    if (password.length < 8) throw new Error("密码至少 8 位");
    await db.update(users).set({ passwordHash: await bcrypt.hash(password, 10), updatedAt: new Date() }).where(eq(users.id, id));
    await audit(me.id, "user.reset_password", { id });
  }, "密码已重置");
}

export async function deleteUser(id: string) {
  return run(async () => {
    const me = await assertSuperAdmin();
    if (id === me.id) throw new Error("不能删除当前登录的账号");
    const [u] = await db.select().from(users).where(eq(users.id, id));
    if (!u) throw new Error("用户不存在");
    if (u.globalRole === "super_admin" && (await superAdminCount(id)) === 0) throw new Error("不能删除最后一名全局管理员");
    await db.delete(users).where(eq(users.id, id));
    await audit(me.id, "user.delete", { id, email: u.email });
    revalidatePath("/admin/users");
  }, "用户已删除");
}

/** 在用户详情里批量设置其所属项目及项目角色 */
export async function setUserProjects(userId: string, assignments: { projectId: string; role: "project_admin" | "member" }[]) {
  return run(async () => {
    const me = await assertSuperAdmin();
    await db.delete(projectMembers).where(eq(projectMembers.userId, userId));
    if (assignments.length) await db.insert(projectMembers).values(assignments.map((a) => ({ ...a, userId })));
    await audit(me.id, "user.set_projects", { userId, assignments });
    revalidatePath("/admin/users");
  }, "项目归属已更新");
}

/* ============================== 项目 ============================== */

const projectSchema = z.object({
  code: z.string().trim().min(1, "请输入项目代号").max(32).regex(/^[A-Za-z0-9_-]+$/, "项目代号仅限字母、数字、- 和 _"),
  name: z.string().trim().min(1, "请输入项目名称"),
  clientName: z.string().trim().optional(),
  dealType: z.string().trim().optional(),
  description: z.string().trim().optional(),
});

export async function createProject(input: z.input<typeof projectSchema> & { modules: string[]; adminUserId?: string }) {
  return run(async () => {
    const me = await assertSuperAdmin();
    const d = projectSchema.parse(input);
    const [dup] = await db.select({ id: projects.id }).from(projects).where(eq(projects.code, d.code.toUpperCase()));
    if (dup) throw new Error("项目代号已存在");
    const p = await createProjectWithDefaults(
      { code: d.code, name: d.name, clientName: d.clientName || null, dealType: d.dealType || null, description: d.description || null },
      input.modules,
      me.id,
    );
    if (input.adminUserId) await db.insert(projectMembers).values({ projectId: p.id, userId: input.adminUserId, role: "project_admin" });
    await audit(me.id, "project.create", { code: p.code, name: p.name, modules: input.modules }, p.id);
    revalidatePath("/admin/projects");
    revalidatePath("/");
    return { id: p.id };
  }, "项目已创建");
}

export async function deleteProject(id: string, confirmCode: string) {
  return run(async () => {
    const me = await assertSuperAdmin();
    const [p] = await db.select().from(projects).where(eq(projects.id, id));
    if (!p) throw new Error("项目不存在");
    if (confirmCode.trim().toUpperCase() !== p.code) throw new Error("项目代号输入不一致，已取消删除");
    await db.delete(projects).where(eq(projects.id, id));
    await audit(me.id, "project.delete", { code: p.code, name: p.name });
    revalidatePath("/admin/projects");
    revalidatePath("/");
  }, "项目已删除");
}

export async function setProjectStatus(id: string, status: "active" | "on_hold" | "closed") {
  return run(async () => {
    const me = await assertSuperAdmin();
    await db.update(projects).set({ status, updatedAt: new Date() }).where(eq(projects.id, id));
    await audit(me.id, "project.status", { status }, id);
    revalidatePath("/admin/projects");
  });
}

export async function getProjectModulesFor(id: string) {
  await assertSuperAdmin();
  return db.select().from(projectModules).where(eq(projectModules.projectId, id));
}

/* ============================ API Key ============================ */

export async function createApiKey(input: { label: string; key: string; model: string; isDefault: boolean }) {
  return run(async () => {
    const me = await assertSuperAdmin();
    const key = input.key.trim();
    if (!input.label.trim()) throw new Error("请填写名称");
    if (key.length < 20) throw new Error("API Key 格式不正确");
    if (!input.model.trim()) throw new Error("请填写模型");
    if (input.isDefault) await db.update(apiKeys).set({ isDefault: false });
    await db.insert(apiKeys).values({
      label: input.label.trim(), encryptedKey: encrypt(key), last4: key.slice(-4), model: input.model.trim(),
      isDefault: input.isDefault, createdBy: me.id,
    });
    await audit(me.id, "apikey.create", { label: input.label, last4: key.slice(-4) });
    revalidatePath("/admin/api-keys");
  }, "API Key 已保存（加密存储）");
}

export async function updateApiKey(id: string, input: { label: string; model: string; isActive: boolean; isDefault: boolean; key?: string }) {
  return run(async () => {
    const me = await assertSuperAdmin();
    if (input.isDefault) await db.update(apiKeys).set({ isDefault: false });
    const patch: Partial<typeof apiKeys.$inferInsert> = {
      label: input.label.trim(), model: input.model.trim(), isActive: input.isActive, isDefault: input.isDefault, updatedAt: new Date(),
    };
    if (input.key?.trim()) {
      patch.encryptedKey = encrypt(input.key.trim());
      patch.last4 = input.key.trim().slice(-4);
      patch.lastTestOk = null;
    }
    await db.update(apiKeys).set(patch).where(eq(apiKeys.id, id));
    await audit(me.id, "apikey.update", { id, label: input.label, rotated: !!input.key });
    revalidatePath("/admin/api-keys");
  }, "已保存");
}

export async function deleteApiKey(id: string) {
  return run(async () => {
    const me = await assertSuperAdmin();
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
    await audit(me.id, "apikey.delete", { id });
    revalidatePath("/admin/api-keys");
  }, "已删除");
}

export async function testApiKey(id: string) {
  return run(async () => {
    await assertSuperAdmin();
    const [k] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    if (!k) throw new Error("Key 不存在");
    let ok = false;
    try {
      const models = await listModels(decrypt(k.encryptedKey));
      ok = true;
      return { models, modelAvailable: models.includes(k.model) };
    } finally {
      await db.update(apiKeys).set({ lastTestedAt: new Date(), lastTestOk: ok }).where(eq(apiKeys.id, id));
      revalidatePath("/admin/api-keys");
    }
  }, "连接成功");
}

/** 新增 Key 前先用明文 Key 拉取可用模型列表（不保存） */
export async function previewModels(key: string) {
  return run(async () => {
    await assertSuperAdmin();
    return listModels(key.trim());
  });
}
