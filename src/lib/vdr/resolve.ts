import type { VdrCap, VdrSecurity, VdrDownloadMode } from "@/db/schema";
import { ALL_CAPS, normCaps } from "./caps";

/** 纯函数，服务端与浏览器（管理员“按权限组视角预览”）共用 */
export type Viewer = { userId: string; isManager: boolean; group: string | null; organization: string | null };
type FolderLike = { id: string; parentId: string | null; security?: VdrSecurity | null };
type FileLike = { id: string; folderId: string; security?: VdrSecurity | null };
export type PermLike = { targetType: "folder" | "file"; targetId: string; subjectType: "group" | "user"; subject: string; caps: VdrCap[]; expiresAt?: string | Date | null };

/**
 * 权限解析器：就近生效——文件（用户 > 权限组）→ 所在目录 → 上级目录 … → Phase → 权限组默认值。
 * groupDefaults：各权限组未设规则时的默认开关；过期的规则（如外部分享到期）视为不存在。
 */
export function makeResolver<F extends FolderLike>(folders: F[], perms: PermLike[], viewer: Viewer, groupDefaults: Record<string, VdrCap[]> = {}, now = Date.now()) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const idx = new Map<string, PermLike[]>();
  for (const p of perms) {
    if (p.expiresAt && new Date(p.expiresAt).getTime() < now) continue;
    const k = `${p.targetType}:${p.targetId}`;
    (idx.get(k) ?? idx.set(k, []).get(k)!).push(p);
  }
  const at = (type: "folder" | "file", id: string): VdrCap[] | null => {
    const list = idx.get(`${type}:${id}`);
    if (!list) return null;
    const u = list.find((p) => p.subjectType === "user" && p.subject === viewer.userId);
    if (u) return u.caps;
    const g = viewer.group ? list.find((p) => p.subjectType === "group" && p.subject === viewer.group) : undefined;
    return g ? g.caps : null;
  };
  const dflt = () => (viewer.group ? groupDefaults[viewer.group] ?? [] : []);
  const cache = new Map<string, VdrCap[]>();
  const folderCaps = (id: string): VdrCap[] => {
    if (viewer.isManager) return ALL_CAPS;
    if (cache.has(id)) return cache.get(id)!;
    const f = byId.get(id);
    let c = at("folder", id);
    if (!c) c = f?.parentId ? folderCaps(f.parentId) : dflt();
    c = normCaps(c);
    cache.set(id, c);
    return c;
  };
  const fileCaps = (file: { id: string; folderId: string }): VdrCap[] => {
    if (viewer.isManager) return ALL_CAPS;
    const own = at("file", file.id);
    return own ? normCaps(own) : folderCaps(file.folderId);
  };
  const phaseOf = (folderId: string): F | undefined => {
    let f = byId.get(folderId);
    let guard = 0;
    while (f && f.parentId && guard++ < 50) f = byId.get(f.parentId);
    return f;
  };
  /** 文档安全策略：逐字段就近继承（文件 → 所在目录 → … → Phase） */
  const securityOf = (file: FileLike | null, folderId: string): Required<{ [K in keyof VdrSecurity]: NonNullable<VdrSecurity[K]> | null }> => {
    const out: { fence: boolean | null; downloadModes: VdrDownloadMode[] | null; irmExpiryDays: number | null; irmPrintLimit: number | null } = { fence: null, downloadModes: null, irmExpiryDays: null, irmPrintLimit: null };
    const take = (s?: VdrSecurity | null) => {
      if (!s) return;
      if (out.fence === null && typeof s.fence === "boolean") out.fence = s.fence;
      if (out.downloadModes === null && Array.isArray(s.downloadModes)) out.downloadModes = s.downloadModes;
      if (out.irmExpiryDays === null && typeof s.irmExpiryDays === "number") out.irmExpiryDays = s.irmExpiryDays;
      if (out.irmPrintLimit === null && typeof s.irmPrintLimit === "number") out.irmPrintLimit = s.irmPrintLimit;
    };
    take(file?.security);
    let f = byId.get(folderId);
    let guard = 0;
    while (f && guard++ < 50) { take(f.security); f = f.parentId ? byId.get(f.parentId) : undefined; }
    return out;
  };
  return { folderCaps, fileCaps, phaseOf, securityOf };
}

/** 权限设置界面：某主体在该对象上「继承」得到的开关（排除对象自身的规则） */
export function inheritedCaps<F extends FolderLike>(
  folders: F[], perms: PermLike[], groupDefaults: Record<string, VdrCap[]>,
  subject: { userId?: string; group: string | null }, target: { type: "folder" | "file"; id: string; folderId: string | null },
) {
  const others = perms.filter((p) => !(p.targetType === target.type && p.targetId === target.id));
  const R = makeResolver(folders, others, { userId: subject.userId ?? "__none__", isManager: false, group: subject.group, organization: null }, groupDefaults);
  if (target.type === "file") return R.folderCaps(target.folderId!);
  return target.folderId ? R.folderCaps(target.folderId) : normCaps(subject.group ? groupDefaults[subject.group] ?? [] : []);
}
