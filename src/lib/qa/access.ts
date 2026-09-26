import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projectMembers } from "@/db/schema";
import { getProjectAccess } from "@/lib/auth";
import { QA_RANK, isQaGroup, canSee, type QaGroup } from "./groups";

export * from "./groups";

export type QaViewer = { userId: string; name: string; rank: number; group: QaGroup | null; isManager: boolean };

/** 当前用户在项目中的 Q&A 视角：项目管理员 / 全局管理员视为 ADM */
export async function qaViewer(projectId: string): Promise<QaViewer | null> {
  const a = await getProjectAccess(projectId);
  if (!a) return null;
  if (a.canManage) return { userId: a.user.id, name: a.user.name, rank: QA_RANK.ADM, group: "ADM", isManager: true };
  const [m] = await db
    .select({ g: projectMembers.vdrGroup })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, a.user.id)))
    .limit(1);
  const g = m?.g ?? null;
  const group = isQaGroup(g) ? g : null;
  return { userId: a.user.id, name: a.user.name, rank: group ? QA_RANK[group] : 0, group, isManager: false };
}

type FieldLike = { key: string; role: string | null };

export function accessKey(fields: FieldLike[]) {
  return fields.find((f) => f.role === "access")?.key ?? "access_group";
}

/** Q&A 记录按权限组过滤（管理员可见全部） */
export function filterQa<T extends { data: Record<string, unknown> }>(items: T[], fields: FieldLike[], rank: number): T[] {
  const k = accessKey(fields);
  return items.filter((i) => canSee(rank, i.data[k]));
}
