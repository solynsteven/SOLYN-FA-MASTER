import "server-only";
import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, projects, projectMembers, projectModules, auditLogs } from "@/db/schema";
import { readSession } from "./session";
import type { ModuleKey } from "./modules";

export type ProjectRole = "super_admin" | "project_admin" | "member";

export const getCurrentUser = cache(async () => {
  const s = await readSession();
  if (!s) return null;
  const [u] = await db.select().from(users).where(eq(users.id, s.sub)).limit(1);
  if (!u || !u.isActive) return null;
  return u;
});

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireSuperAdmin() {
  const u = await requireUser();
  if (u.globalRole !== "super_admin") redirect("/");
  return u;
}

/** 解析当前用户在某项目中的角色；无权限返回 null */
export const getProjectAccess = cache(async (projectId: string) => {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;
  let role: ProjectRole | null = null;
  if (user.globalRole === "super_admin") role = "super_admin";
  else {
    const [m] = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id)))
      .limit(1);
    role = m?.role ?? null;
  }
  if (!role) return null;
  const mods = await db.select().from(projectModules).where(eq(projectModules.projectId, projectId));
  const enabled = new Set(mods.filter((m) => m.enabled).map((m) => m.moduleKey as ModuleKey));
  return { user, project, role, canManage: role !== "member", enabledModules: enabled };
});

export async function requireProject(projectId: string, opts?: { manage?: boolean; module?: ModuleKey }) {
  const user = await requireUser();
  const access = await getProjectAccess(projectId);
  if (!access) notFound();
  if (opts?.manage && !access.canManage) redirect(`/p/${projectId}`);
  if (opts?.module && !access.enabledModules.has(opts.module)) notFound();
  return { ...access, user };
}

/** 供 Server Action 使用：不重定向，直接抛错 */
export async function assertProject(projectId: string, manage = false) {
  const access = await getProjectAccess(projectId);
  if (!access) throw new Error("无权访问该项目");
  if (manage && !access.canManage) throw new Error("仅项目管理员或全局管理员可执行此操作");
  return access;
}

export async function assertSuperAdmin() {
  const u = await getCurrentUser();
  if (!u || u.globalRole !== "super_admin") throw new Error("仅全局管理员可执行此操作");
  return u;
}

export async function audit(actorId: string | null, action: string, detail: Record<string, unknown> = {}, projectId?: string | null) {
  await db.insert(auditLogs).values({ actorId, action, detail, projectId: projectId ?? null });
}

export const ROLE_LABEL: Record<string, string> = {
  super_admin: "全局管理员",
  project_admin: "项目管理员",
  member: "项目用户",
  user: "普通用户",
};
