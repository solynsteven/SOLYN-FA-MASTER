import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, projects, projectMembers } from "@/db/schema";
import { PageHeader } from "@/components/PageHeader";
import { requireSuperAdmin } from "@/lib/auth";
import { UsersClient } from "./UsersClient";

export const metadata = { title: "用户管理" };

export default async function UsersPage() {
  const me = await requireSuperAdmin();
  const [list, plist, mem] = await Promise.all([
    db.select().from(users).orderBy(asc(users.createdAt)),
    db.select({ id: projects.id, name: projects.name, code: projects.code }).from(projects).orderBy(asc(projects.code)),
    db.select({ userId: projectMembers.userId, projectId: projectMembers.projectId, role: projectMembers.role }).from(projectMembers),
  ]);
  return (
    <>
      <PageHeader eyebrow="Users" title="用户管理" desc="创建账号、设置全局角色、分配项目与项目角色" />
      <UsersClient
        meId={me.id}
        users={list.map((u) => ({
          id: u.id, name: u.name, email: u.email, title: u.title ?? "", globalRole: u.globalRole, isActive: u.isActive,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null, createdAt: u.createdAt.toISOString(),
          projects: mem.filter((m) => m.userId === u.id).map((m) => ({ projectId: m.projectId, role: m.role })),
        }))}
        projects={plist}
      />
    </>
  );
}
