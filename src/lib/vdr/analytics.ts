import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { vdrEvents, users, projectMembers } from "@/db/schema";
import { loadVdr } from "./access";
import { todayISO } from "@/lib/format";

const ACCESS = ["view", "print", "download"] as const;
type Act = (typeof ACCESS)[number];
const DAY = 86400000;

/** 访问分析参数 */
export const ANALYTICS = {
  windowDays: 90, // 统计最近 90 天
  sparkDays: 14, // 迷你趋势 14 天
  repeatThreshold: 3, // 同一用户查看同一文件 ≥ 3 次视为“反复查看”
  stopRecentDays: 3, // 最近 3 天无访问
  stopPriorMin: 5, // 且此前（第 4–14 天）至少 5 次访问 → “突然停止访问”
};

const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(d);

export async function vdrAnalytics(projectId: string) {
  const since = new Date(Date.now() - ANALYTICS.windowDays * DAY);
  const [events, members, vdr] = await Promise.all([
    db.select().from(vdrEvents).where(and(eq(vdrEvents.projectId, projectId), inArray(vdrEvents.action, [...ACCESS]), gte(vdrEvents.createdAt, since))),
    db.select({ userId: projectMembers.userId, role: projectMembers.role, group: projectMembers.vdrGroup, org: projectMembers.organization, name: users.name, globalRole: users.globalRole })
      .from(projectMembers).innerJoin(users, eq(users.id, projectMembers.userId)).where(eq(projectMembers.projectId, projectId)),
    loadVdr(projectId, { includeDeleted: true }),
  ]);
  const extraIds = [...new Set(events.map((e) => e.userId).filter((id) => id && !members.some((m) => m.userId === id)))] as string[];
  const extras = extraIds.length ? await db.select({ id: users.id, name: users.name, globalRole: users.globalRole }).from(users).where(inArray(users.id, extraIds)) : [];
  const person = new Map<string, { name: string; group: string | null; org: string; internal: boolean }>();
  for (const m of members)
    person.set(m.userId, { name: m.name, group: m.group, org: m.org || (m.group ? `（${m.group} 未填机构）` : "（未设置机构）"), internal: m.role === "project_admin" || m.group === "ADM" || m.globalRole === "super_admin" });
  for (const x of extras) person.set(x.id, { name: x.name, group: null, org: x.globalRole === "super_admin" ? "Solyn（管理员）" : "（已移出项目）", internal: x.globalRole === "super_admin" });

  const folders = new Map(vdr.folders.map((f) => [f.id, f]));
  const pathOf = (folderId: string) => {
    const n: string[] = [];
    let c = folders.get(folderId);
    while (c) { n.unshift(c.name); c = c.parentId ? folders.get(c.parentId) : undefined; }
    return n.join(" / ");
  };
  const files = new Map(vdr.files.map((f) => [f.id, f]));
  const today = todayISO();
  const now = Date.now();
  const days = Array.from({ length: ANALYTICS.sparkDays }, (_, i) => dayKey(new Date(now - (ANALYTICS.sparkDays - 1 - i) * DAY)));

  /* ---------- 文件 ---------- */
  const fileStats = new Map<string, { views: number; prints: number; downloads: number; users: Map<string, number>; last: Date }>();
  for (const e of events) {
    if (!e.fileId) continue;
    const s = fileStats.get(e.fileId) ?? { views: 0, prints: 0, downloads: 0, users: new Map(), last: e.createdAt };
    if (e.action === "view") s.views++;
    if (e.action === "print") s.prints++;
    if (e.action === "download") s.downloads++;
    if (e.userId && e.action === "view") s.users.set(e.userId, (s.users.get(e.userId) ?? 0) + 1);
    if (e.createdAt > s.last) s.last = e.createdAt;
    fileStats.set(e.fileId, s);
  }
  const topFiles = [...fileStats.entries()]
    .map(([id, s]) => {
      const f = files.get(id);
      const top = [...s.users.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        id, name: f?.name ?? "（已彻底删除）", path: f ? pathOf(f.folderId) : "", deleted: !!f?.deletedAt, taskCode: f?.taskCode ?? null, ddCode: f?.ddCode ?? null,
        views: s.views, prints: s.prints, downloads: s.downloads, total: s.views + s.prints + s.downloads, viewers: s.users.size,
        maxByOne: top?.[1] ?? 0, maxByOneName: top ? person.get(top[0])?.name ?? "" : "", maxByOneOrg: top ? person.get(top[0])?.org ?? "" : "",
        repeat: (top?.[1] ?? 0) >= ANALYTICS.repeatThreshold, last: s.last.toISOString(),
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 30);

  /* ---------- 机构（买家） ---------- */
  type OrgAgg = { org: string; groups: Set<string>; users: Set<string>; views: number; prints: number; downloads: number; files: Set<string>; last: Date | null; daily: number[]; recent: number; prior: number; activeDays: Set<string> };
  const orgs = new Map<string, OrgAgg>();
  const external = members.filter((m) => !person.get(m.userId)!.internal);
  for (const m of external) {
    const p = person.get(m.userId)!;
    if (!orgs.has(p.org)) orgs.set(p.org, { org: p.org, groups: new Set(), users: new Set(), views: 0, prints: 0, downloads: 0, files: new Set(), last: null, daily: days.map(() => 0), recent: 0, prior: 0, activeDays: new Set() });
    const o = orgs.get(p.org)!;
    if (m.group) o.groups.add(m.group);
  }
  for (const e of events) {
    const p = e.userId ? person.get(e.userId) : undefined;
    if (!p || p.internal) continue;
    const o = orgs.get(p.org) ?? { org: p.org, groups: new Set<string>(), users: new Set<string>(), views: 0, prints: 0, downloads: 0, files: new Set<string>(), last: null, daily: days.map(() => 0), recent: 0, prior: 0, activeDays: new Set<string>() };
    orgs.set(p.org, o);
    o.users.add(e.userId!);
    if (p.group) o.groups.add(p.group);
    o[e.action === "view" ? "views" : e.action === "print" ? "prints" : "downloads"]++;
    if (e.fileId) o.files.add(e.fileId);
    if (!o.last || e.createdAt > o.last) o.last = e.createdAt;
    const dk = dayKey(e.createdAt);
    o.activeDays.add(dk);
    const di = days.indexOf(dk);
    if (di >= 0) o.daily[di]++;
    const age = (now - e.createdAt.getTime()) / DAY;
    if (age < ANALYTICS.stopRecentDays) o.recent++;
    else if (age < ANALYTICS.sparkDays) o.prior++;
  }
  const orgRows = [...orgs.values()]
    .map((o) => {
      const total = o.views + o.prints + o.downloads;
      const status: "active" | "stopped" | "cooling" | "none" =
        total === 0 ? "none" : o.recent === 0 && o.prior >= ANALYTICS.stopPriorMin ? "stopped" : o.recent === 0 ? "cooling" : "active";
      return {
        org: o.org, groups: [...o.groups].sort(), users: o.users.size, views: o.views, prints: o.prints, downloads: o.downloads, total,
        files: o.files.size, activeDays: o.activeDays.size, last: o.last?.toISOString() ?? null, daily: o.daily, recent: o.recent, prior: o.prior, status,
        daysSince: o.last ? Math.floor((now - o.last.getTime()) / DAY) : null,
      };
    })
    .sort((a, b) => b.total - a.total);

  /* ---------- 权限组 ---------- */
  const groupRows = ["SEL", "BID1", "BID2", "EXC", "DD"].map((g) => {
    const rows = events.filter((e) => e.userId && person.get(e.userId)?.group === g && !person.get(e.userId)?.internal);
    return { group: g, total: rows.length, views: rows.filter((e) => e.action === "view").length, prints: rows.filter((e) => e.action === "print").length, downloads: rows.filter((e) => e.action === "download").length, users: new Set(rows.map((e) => e.userId)).size };
  });

  /* ---------- 最近访问 ---------- */
  const recent = [...events].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 200).map((e) => {
    const p = e.userId ? person.get(e.userId) : undefined;
    const f = e.fileId ? files.get(e.fileId) : undefined;
    return { id: e.id, at: e.createdAt.toISOString(), action: e.action as Act, user: p?.name ?? "—", org: p?.org ?? "", group: p?.group ?? "", internal: !!p?.internal, file: f?.name ?? String(e.detail?.name ?? ""), ip: e.ip ?? "" };
  });

  const ext = events.filter((e) => e.userId && !person.get(e.userId)?.internal);
  return {
    params: ANALYTICS, today, days,
    kpi: {
      files: vdr.files.filter((f) => !f.deletedAt).length,
      accesses: ext.length, views: ext.filter((e) => e.action === "view").length, prints: ext.filter((e) => e.action === "print").length, downloads: ext.filter((e) => e.action === "download").length,
      users: new Set(ext.map((e) => e.userId)).size, orgs: orgRows.filter((o) => o.total > 0).length,
      last7: ext.filter((e) => now - e.createdAt.getTime() < 7 * DAY).length,
      stopped: orgRows.filter((o) => o.status === "stopped").length,
      repeatFiles: topFiles.filter((f) => f.repeat).length,
    },
    topFiles, orgs: orgRows, groups: groupRows, recent,
  };
}
export type VdrAnalytics = Awaited<ReturnType<typeof vdrAnalytics>>;
