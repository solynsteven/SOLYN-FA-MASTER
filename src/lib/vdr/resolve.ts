import type { VdrGroup, VdrLevel } from "@/db/schema";
import { DEFAULT_GROUP_LEVEL } from "./constants";

/** 纯函数，服务端与浏览器（管理员“按权限组视角预览”）共用 */
export type Viewer = { userId: string; isManager: boolean; group: VdrGroup | null; organization: string | null };
type FolderLike = { id: string; parentId: string | null };
type PermLike = { targetType: "folder" | "file"; targetId: string; subjectType: "group" | "user"; subject: string; level: VdrLevel };

/** 权限解析器：就近生效——文件（用户 > 权限组）→ 所在目录 → 上级目录 … → Phase → 默认 */
export function makeResolver<F extends FolderLike>(folders: F[], perms: PermLike[], viewer: Viewer) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const idx = new Map<string, PermLike[]>();
  for (const p of perms) {
    const k = `${p.targetType}:${p.targetId}`;
    (idx.get(k) ?? idx.set(k, []).get(k)!).push(p);
  }
  const at = (type: "folder" | "file", id: string): VdrLevel | null => {
    const list = idx.get(`${type}:${id}`);
    if (!list) return null;
    const u = list.find((p) => p.subjectType === "user" && p.subject === viewer.userId);
    if (u) return u.level;
    const g = viewer.group ? list.find((p) => p.subjectType === "group" && p.subject === viewer.group) : undefined;
    return g ? g.level : null;
  };
  const cache = new Map<string, VdrLevel>();
  const folderLevel = (id: string): VdrLevel => {
    if (viewer.isManager) return "O";
    if (cache.has(id)) return cache.get(id)!;
    const f = byId.get(id);
    let l = at("folder", id);
    if (!l) l = f?.parentId ? folderLevel(f.parentId) : viewer.group ? DEFAULT_GROUP_LEVEL[viewer.group] : "X";
    cache.set(id, l);
    return l;
  };
  const fileLevel = (file: { id: string; folderId: string }): VdrLevel => {
    if (viewer.isManager) return "O";
    return at("file", file.id) ?? folderLevel(file.folderId);
  };
  const phaseOf = (folderId: string): F | undefined => {
    let f = byId.get(folderId);
    let guard = 0;
    while (f && f.parentId && guard++ < 50) f = byId.get(f.parentId);
    return f;
  };
  /** 指定主体（权限组或用户）的继承值，用于权限设置界面展示“继承自上级”的值 */
  const inheritedFor = (subjectType: "group" | "user", subject: string, group: VdrGroup | null, type: "folder" | "file", id: string, parentFolderId: string | null) => {
    const v: Viewer = { userId: subjectType === "user" ? subject : "__none__", isManager: false, group: subjectType === "group" ? (subject as VdrGroup) : group, organization: null };
    const r = makeResolver(folders, perms.filter((p) => !(p.targetType === type && p.targetId === id)), v);
    return type === "file" ? r.folderLevel(parentFolderId!) : parentFolderId ? r.folderLevel(parentFolderId) : v.group ? DEFAULT_GROUP_LEVEL[v.group] : "X";
  };
  return { folderLevel, fileLevel, phaseOf, inheritedFor };
}

