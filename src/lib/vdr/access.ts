import "server-only";
import { cache } from "react";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/db";
import { vdrFolders, vdrFiles, vdrPermissions, projectMembers, trackerItems, fieldDefinitions, userSessions, vdrNdaSignatures } from "@/db/schema";
import type { VdrFolder, VdrGroup, VdrGroupRow, VdrCap } from "@/db/schema";
import { getProjectAccess, getCurrentSession } from "@/lib/auth";
import { clientIp } from "@/lib/net";
import { ipAllowed } from "@/lib/net";
import { listGroups, groupDefaultsOf, getVdrSettings, watermarkText, type VdrSettingsView } from "./groups";
import { logVdr } from "./events";
import type { Viewer } from "./resolve";
import { statusKind } from "@/lib/status";

export type { Viewer };

export async function loadViewer(projectId: string, userId: string, canManage: boolean): Promise<Viewer> {
  const [m] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  return { userId, isManager: canManage, group: (m?.vdrGroup as VdrGroup) ?? null, organization: m?.organization ?? null };
}
import { makeResolver } from "./resolve";

export async function loadVdr(projectId: string, opts: { includeDeleted?: boolean } = {}) {
  const [folders, files, perms] = await Promise.all([
    db.select().from(vdrFolders).where(opts.includeDeleted ? eq(vdrFolders.projectId, projectId) : and(eq(vdrFolders.projectId, projectId), isNull(vdrFolders.deletedAt))),
    db.select().from(vdrFiles).where(opts.includeDeleted ? eq(vdrFiles.projectId, projectId) : and(eq(vdrFiles.projectId, projectId), isNull(vdrFiles.deletedAt))),
    db.select().from(vdrPermissions).where(eq(vdrPermissions.projectId, projectId)),
  ]);
  return { folders, files, perms };
}

/** FA 任务状态（用于 Phase 按进度自动开放） */
export async function faTaskStatuses(projectId: string) {
  const fields = await db.select().from(fieldDefinitions).where(and(eq(fieldDefinitions.projectId, projectId), eq(fieldDefinitions.moduleKey, "fa")));
  const codeK = fields.find((f) => f.role === "code")?.key;
  const statusK = fields.find((f) => f.role === "status")?.key;
  const rows = await db
    .select({ data: trackerItems.data })
    .from(trackerItems)
    .where(and(eq(trackerItems.projectId, projectId), eq(trackerItems.moduleKey, "fa"), isNull(trackerItems.deletedAt)));
  const m = new Map<string, string>();
  if (codeK && statusK) for (const r of rows) m.set(String(r.data[codeK] ?? "").trim(), String(r.data[statusK] ?? ""));
  return m;
}

export function phaseIsOpen(p: VdrFolder, taskStatus: Map<string, string>) {
  if (p.openMode === "open") return true;
  if (p.openMode === "closed") return false;
  const st = p.openTaskCode ? taskStatus.get(p.openTaskCode.trim()) : undefined;
  if (st === undefined) return false;
  const k = statusKind(st);
  return p.openTrigger === "done" ? k === "done" : k === "done" || k === "progress" || k === "partial";
}

export { makeResolver } from "./resolve";

/* ------------------------------ 准入风控（数据室门禁） ------------------------------ */

export type GateFail = { code: "no_access" | "no_group" | "expired" | "not_started" | "window" | "ip" | "domain" | "mfa_setup" | "mfa_reauth" | "concurrent" | "nda"; message: string };

const WD = ["日", "一", "二", "三", "四", "五", "六"];
function windowOk(w: NonNullable<VdrGroupRow["policy"]["window"]>, now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: w.tz || "Asia/Tokyo", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now).map((p) => [p.type, p.value]));
  const day = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[parts.weekday] ?? 0;
  const hm = `${String(Number(parts.hour) % 24).padStart(2, "0")}:${parts.minute}`;
  if (w.days?.length && !w.days.includes(day)) return false;
  if (w.start && w.end) return w.start <= w.end ? hm >= w.start && hm < w.end : hm >= w.start || hm < w.end;
  return true;
}
export const windowText = (w: NonNullable<VdrGroupRow["policy"]["window"]>) =>
  `${w.days?.length ? `每周${w.days.map((d) => WD[d % 7]).join("、")}` : "每天"} ${w.start || "00:00"}–${w.end || "24:00"}（${w.tz || "Asia/Tokyo"}）`;

/**
 * 进入数据室前的全部检查（项目管理员与全局管理员不受限）：
 * 权限组 → 成员到期 / 组有效期 → 访问时段 → IP 白名单 → 邮箱域名 → MFA → 并发会话 → NDA
 */
export const vdrContext = cache(async (projectId: string) => {
  const access = await getProjectAccess(projectId);
  if (!access || !access.enabledModules.has("vdr")) return null;
  const session = await getCurrentSession();
  const [member] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, access.user.id)));
  const [groups, settings, ip] = await Promise.all([listGroups(projectId), getVdrSettings(projectId), clientIp()]);
  const isManager = access.canManage;
  const groupCode = member?.vdrGroup ?? null;
  const group = groups.find((g) => g.code === groupCode) ?? null;
  const viewer: Viewer = { userId: access.user.id, isManager, group: group?.code ?? null, organization: member?.organization ?? null };
  const wm = watermarkText(settings.watermark, {
    name: access.user.name, email: access.user.email, org: member?.organization ?? (isManager ? "Solyn Advisory" : null), ip,
    projectName: access.project.name, projectCode: access.project.code, projectId,
  });
  const base = { access, session, member: member ?? null, groups, groupDefaults: groupDefaultsOf(groups), group, settings, viewer, ip, watermark: wm, isManager };
  if (isManager) return { ...base, fail: null as GateFail | null };

  const now = new Date();
  const pol = group?.policy ?? {};
  let fail: GateFail | null = null;
  if (!group) fail = { code: "no_group", message: "您尚未被分配数据室权限组，请联系项目管理员。" };
  else if (member?.accessExpiresAt && member.accessExpiresAt < now) fail = { code: "expired", message: `您的数据室访问已于 ${member.accessExpiresAt.toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" })} 到期。` };
  else if (pol.accessUntil && new Date(pol.accessUntil) < now) fail = { code: "expired", message: `「${group.name}」的数据室访问已于 ${new Date(pol.accessUntil).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" })} 到期。` };
  else if (pol.accessFrom && new Date(pol.accessFrom) > now) fail = { code: "not_started", message: `「${group.name}」的数据室访问将于 ${new Date(pol.accessFrom).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" })} 开放。` };
  else if (pol.window && !windowOk(pol.window, now)) fail = { code: "window", message: `当前不在允许的访问时段内：${windowText(pol.window)}。` };
  else if (!ipAllowed(ip, pol.ipAllowlist)) fail = { code: "ip", message: `当前网络（IP ${ip || "未知"}）不在允许访问的范围内，请在公司网络或指定 VPN 下访问。` };
  else if (pol.emailDomains?.length && !pol.emailDomains.some((d) => access.user.email.toLowerCase().endsWith("@" + d.toLowerCase().replace(/^@/, "")))) fail = { code: "domain", message: "您的邮箱域名不在该权限组允许的范围内。" };
  else if ((settings.requireMfa || pol.requireMfa) && !access.user.mfaEnabled) fail = { code: "mfa_setup", message: "访问本数据室需要开启二次验证（MFA）。请先在「账号设置」中绑定验证器 App。" };
  else if ((settings.requireMfa || pol.requireMfa) && !session?.mfa) fail = { code: "mfa_reauth", message: "访问本数据室需要通过二次验证，请退出后重新登录并完成验证。" };
  if (!fail && pol.maxSessions && session) {
    // 单账号并发控制：保留最新登录的 N 个会话，其余强制下线
    const active = await db.select({ id: userSessions.id }).from(userSessions)
      .where(and(eq(userSessions.userId, access.user.id), isNull(userSessions.revokedAt), gt(userSessions.lastSeenAt, new Date(Date.now() - 12 * 3600_000))))
      .orderBy(desc(userSessions.createdAt));
    const keep = active.slice(0, pol.maxSessions).map((x) => x.id);
    if (!keep.includes(session.id)) fail = { code: "concurrent", message: `该账号已在其他设备登录（最多允许 ${pol.maxSessions} 个同时在线的会话），本会话已失效。` };
    else for (const x of active.slice(pol.maxSessions)) {
      await db.update(userSessions).set({ revokedAt: new Date(), revokeReason: "concurrent" }).where(eq(userSessions.id, x.id));
      await logVdr(projectId, access.user.id, "session_revoke", { detail: { reason: "concurrent", session: x.id } });
    }
  }
  if (!fail && settings.ndaRequired) {
    const [sig] = await db.select({ id: vdrNdaSignatures.id }).from(vdrNdaSignatures)
      .where(and(eq(vdrNdaSignatures.projectId, projectId), eq(vdrNdaSignatures.userId, access.user.id), eq(vdrNdaSignatures.version, settings.ndaVersion))).limit(1);
    if (!sig) fail = { code: "nda", message: "进入数据室前，请先在线阅读并签署保密协议（NDA）。" };
  }
  return { ...base, fail };
});
export type VdrCtx = NonNullable<Awaited<ReturnType<typeof vdrContext>>>;

/** API / Server Action 用：未通过门禁直接抛错（并记录一次拦截） */
export async function requireVdr(projectId: string, opts: { manage?: boolean } = {}) {
  const c = await vdrContext(projectId);
  if (!c) throw new Error("无权访问");
  if (opts.manage && !c.isManager) throw new Error("仅项目管理员可执行此操作");
  if (c.fail) {
    await logVdr(projectId, c.access.user.id, "access_denied", { detail: { code: c.fail.code } });
    throw new Error(c.fail.message);
  }
  return c;
}

export function capsResolver(c: VdrCtx, data: Awaited<ReturnType<typeof loadVdr>>) {
  return makeResolver(data.folders, data.perms.map(permLike), c.viewer, c.groupDefaults);
}
export const permLike = (p: typeof vdrPermissions.$inferSelect) => ({ targetType: p.targetType, targetId: p.targetId, subjectType: p.subjectType, subject: p.subject, caps: p.caps as VdrCap[], expiresAt: p.expiresAt });
export type { VdrSettingsView };

/* ------------------------------ Phase 密码 ------------------------------ */

const key = () => new TextEncoder().encode((process.env.AUTH_SECRET ?? "") + ":vdr-phase");
const cookieName = (phaseId: string) => `vdr_ph_${phaseId.replace(/-/g, "").slice(0, 16)}`;

export async function setPhaseUnlocked(phase: VdrFolder, userId: string) {
  const token = await new SignJWT({ p: phase.id, v: phase.passwordVersion, u: userId })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h").sign(key());
  (await cookies()).set(cookieName(phase.id), token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 12 * 3600 });
}

export async function isPhaseUnlocked(phase: VdrFolder, userId: string) {
  if (!phase.passwordHash) return true;
  const t = (await cookies()).get(cookieName(phase.id))?.value;
  if (!t) return false;
  try {
    const { payload } = await jwtVerify(t, key());
    return payload.p === phase.id && payload.v === phase.passwordVersion && payload.u === userId;
  } catch {
    return false;
  }
}

/** 上传准入：管理员；或在指定目录（未指定时任一目录）拥有「上传」开关且所在 Phase 已开放 */
export async function uploadGuard(projectId: string, folderId?: string | null) {
  const c = await requireVdr(projectId);
  if (!c.access.enabledModules.has("vdr")) throw new Error("本项目未启用 VDR");
  if (c.isManager) return c;
  const data = await loadVdr(projectId);
  const R = capsResolver(c, data);
  const status = await faTaskStatuses(projectId);
  const ok = (fid: string) => {
    if (!R.folderCaps(fid).includes("upload")) return false;
    const ph = R.phaseOf(fid);
    return !!ph && phaseIsOpen(ph as VdrFolder, status);
  };
  if (folderId ? !ok(folderId) : !data.folders.some((f) => ok(f.id))) throw new Error("没有上传权限");
  return c;
}
