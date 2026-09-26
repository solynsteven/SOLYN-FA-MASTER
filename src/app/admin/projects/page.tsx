import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { projects, users } from "@/db/schema";
import { PageHeader } from "@/components/PageHeader";
import { projectStats } from "@/lib/queries";
import { ProjectsClient } from "./ProjectsClient";

export const metadata = { title: "项目管理" };

export default async function AdminProjectsPage() {
  const [list, ulist] = await Promise.all([
    db.select().from(projects).orderBy(desc(projects.createdAt)),
    db.select({ id: users.id, name: users.name, email: users.email, globalRole: users.globalRole }).from(users).orderBy(asc(users.name)),
  ]);
  const stats = await projectStats(list.map((p) => p.id));
  return (
    <>
      <PageHeader eyebrow="Projects" title="项目管理" desc="新增、删除项目，设定每个项目启用的业务模块。项目成员与字段在各项目的「项目管理」中维护。" />
      <ProjectsClient
        projects={list.map((p) => ({
          id: p.id, code: p.code, name: p.name, clientName: p.clientName ?? "", dealType: p.dealType ?? "", status: p.status,
          createdAt: p.createdAt.toISOString(), ...stats.get(p.id)!,
        }))}
        users={ulist.filter((u) => u.globalRole !== "super_admin")}
      />
    </>
  );
}
