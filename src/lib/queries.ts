import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { projects, projectMembers, users, fieldDefinitions, trackerItems, projectModules } from "@/db/schema";
import type { User } from "@/db/schema";

export async function listAccessibleProjects(user: User) {
  if (user.globalRole === "super_admin") {
    const rows = await db.select().from(projects).orderBy(desc(projects.updatedAt));
    return rows.map((p) => ({ ...p, myRole: "super_admin" as const }));
  }
  const rows = await db
    .select({ p: projects, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(eq(projectMembers.userId, user.id))
    .orderBy(desc(projects.updatedAt));
  return rows.map((r) => ({ ...r.p, myRole: r.role }));
}

export async function listProjectMembers(projectId: string) {
  return db
    .select({
      userId: users.id, name: users.name, email: users.email, title: users.title,
      isActive: users.isActive, globalRole: users.globalRole, role: projectMembers.role, joinedAt: projectMembers.createdAt,
      vdrGroup: projectMembers.vdrGroup, organization: projectMembers.organization,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(users.name));
}

export async function listFields(projectId: string, moduleKey: string) {
  return db
    .select()
    .from(fieldDefinitions)
    .where(and(eq(fieldDefinitions.projectId, projectId), eq(fieldDefinitions.moduleKey, moduleKey)))
    .orderBy(asc(fieldDefinitions.sortOrder), asc(fieldDefinitions.createdAt));
}

export async function countItems(projectId: string, moduleKey: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(trackerItems)
    .where(and(eq(trackerItems.projectId, projectId), eq(trackerItems.moduleKey, moduleKey), isNull(trackerItems.deletedAt)));
  return r?.n ?? 0;
}

export async function projectStats(projectIds: string[]) {
  if (!projectIds.length) return new Map<string, { members: number; fa: number; dd: number; modules: string[] }>();
  const mem = await db
    .select({ pid: projectMembers.projectId, n: sql<number>`count(*)::int` })
    .from(projectMembers)
    .where(inArray(projectMembers.projectId, projectIds))
    .groupBy(projectMembers.projectId);
  const items = await db
    .select({ pid: trackerItems.projectId, m: trackerItems.moduleKey, n: sql<number>`count(*)::int` })
    .from(trackerItems)
    .where(and(inArray(trackerItems.projectId, projectIds), isNull(trackerItems.deletedAt)))
    .groupBy(trackerItems.projectId, trackerItems.moduleKey);
  const mods = await db
    .select()
    .from(projectModules)
    .where(and(inArray(projectModules.projectId, projectIds), eq(projectModules.enabled, true)));
  const map = new Map<string, { members: number; fa: number; dd: number; modules: string[] }>();
  for (const id of projectIds) map.set(id, { members: 0, fa: 0, dd: 0, modules: [] });
  mem.forEach((r) => (map.get(r.pid)!.members = r.n));
  items.forEach((r) => {
    const s = map.get(r.pid)!;
    if (r.m === "fa") s.fa = r.n;
    if (r.m === "dd") s.dd = r.n;
  });
  mods.forEach((r) => map.get(r.projectId)!.modules.push(r.moduleKey));
  return map;
}
