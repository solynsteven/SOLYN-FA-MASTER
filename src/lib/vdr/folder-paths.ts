import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { vdrFolders } from "@/db/schema";

export type FolderOpt = { id: string; path: string; name: string; depth: number };

/** 项目内 VDR 文件夹（未删除）及其完整路径「Phase / 子目录 / …」，按树顺序排列 */
export async function vdrFolderPaths(projectId: string): Promise<FolderOpt[]> {
  const rows = await db
    .select({ id: vdrFolders.id, parentId: vdrFolders.parentId, name: vdrFolders.name, sortOrder: vdrFolders.sortOrder })
    .from(vdrFolders)
    .where(and(eq(vdrFolders.projectId, projectId), isNull(vdrFolders.deletedAt)))
    .orderBy(asc(vdrFolders.sortOrder), asc(vdrFolders.name));
  const kids = new Map<string | null, typeof rows>();
  for (const r of rows) kids.set(r.parentId, [...(kids.get(r.parentId) ?? []), r]);
  const out: FolderOpt[] = [];
  const walk = (pid: string | null, prefix: string[], depth: number) => {
    for (const r of kids.get(pid) ?? []) {
      const path = [...prefix, r.name];
      out.push({ id: r.id, path: path.join(" / "), name: r.name, depth });
      walk(r.id, path, depth + 1);
    }
  };
  walk(null, [], 0);
  return out;
}

/** 文本 → 文件夹 id：完整路径全等优先，其次唯一的文件夹名；无法识别返回 null */
export function matchFolder(folders: FolderOpt[], text: string): string | null {
  const t = text.trim().replace(/\s*[/／>›]\s*/g, " / ");
  if (!t) return null;
  const byPath = folders.find((f) => f.path === t);
  if (byPath) return byPath.id;
  const byName = folders.filter((f) => f.name === t);
  return byName.length === 1 ? byName[0].id : null;
}
