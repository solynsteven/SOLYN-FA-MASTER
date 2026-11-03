import "server-only";
import { and, eq } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { db } from "@/db";
import { vdrInvitations, vdrGroups, projectMembers, vdrPermissions, projects, type VdrCap, type VdrInvitation, type User } from "@/db/schema";
import { sendMail, mailHtml } from "@/lib/mail";
import { listGroups } from "./groups";
import { levelOf } from "./caps";
import { logVdr } from "./events";

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function siteOrigin() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
    if (host) return `${proto}://${host}`;
  } catch {}
  return "http://localhost:3000";
}

/** 外部分享专用权限组（默认不可见，仅靠文件级用户规则开放单个文件） */
async function ensureShareGroup(projectId: string) {
  await db.insert(vdrGroups).values({ projectId, code: "SHARE", name: "外部分享", description: "通过「外部分享」邀请的人员，只能看到被分享的文件", kind: "custom", defaultLevel: "L0", defaultCaps: [], sortOrder: 900 }).onConflictDoNothing();
}

export async function createInvitation(i: {
  projectId: string; email: string; name: string | null; groupCode: string | null; organization: string | null; accessExpiresAt: Date | null; linkDays: number;
  shareFileId?: string | null; shareCaps?: VdrCap[] | null; note?: string | null; actor: User;
}) {
  const email = i.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("邮箱格式不正确");
  if (i.groupCode === "SHARE") await ensureShareGroup(i.projectId);
  const groups = await listGroups(i.projectId);
  const g = i.groupCode ? groups.find((x) => x.code === i.groupCode) : null;
  if (i.groupCode && !g) throw new Error("权限组不存在");
  const doms = g?.policy.emailDomains ?? [];
  if (doms.length && !doms.some((d) => email.endsWith("@" + d.toLowerCase().replace(/^@/, "")))) throw new Error(`「${g!.name}」只允许以下邮箱域名：${doms.join("、")}`);
  // 同一邮箱的未处理邀请作废，避免多个有效链接并存
  await db.update(vdrInvitations).set({ status: "revoked" }).where(and(eq(vdrInvitations.projectId, i.projectId), eq(vdrInvitations.email, email), eq(vdrInvitations.status, "pending")));
  const token = randomBytes(24).toString("base64url");
  const [inv] = await db.insert(vdrInvitations).values({
    projectId: i.projectId, email, name: i.name, groupCode: i.groupCode, organization: i.organization, tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + Math.max(1, i.linkDays) * 86400_000), accessExpiresAt: i.accessExpiresAt, shareFileId: i.shareFileId ?? null, shareCaps: i.shareCaps ?? null,
    note: i.note ?? null, createdBy: i.actor.id,
  }).returning();
  const link = `${await siteOrigin()}/invite/${token}`;
  const [p] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, i.projectId));
  const r = await sendMail(email, `【SOLYN FA MASTER】邀请您访问「${p?.name ?? ""}」数据室`, mailHtml(
    `${i.actor.name} 邀请您访问数据室`,
    [
      `您好${i.name ? `，${i.name}` : ""}：`,
      i.shareFileId ? `${i.actor.name} 通过 SOLYN FA MASTER 与您分享了「${p?.name ?? ""}」中的一份文件。` : `您被邀请访问「${p?.name ?? ""}」虚拟数据室${g ? `（权限组：${g.name}）` : ""}。`,
      `请点击下方按钮完成账号设置。邀请链接 ${Math.max(1, i.linkDays)} 天内有效，仅限 ${email} 使用。${i.accessExpiresAt ? `访问权限将于 ${i.accessExpiresAt.toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" })} 自动失效。` : ""}`,
      "首次进入前可能需要开启二次验证并在线签署保密协议。所有访问均会留痕。",
    ],
    { label: "接受邀请", url: link },
  ));
  await logVdr(i.projectId, i.actor.id, "invite", { detail: { email, group: i.groupCode, mailed: r.sent, share: i.shareFileId ?? undefined } });
  return { invitation: inv, link, mailed: r.sent, mailError: r.error };
}

export async function findInvitation(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [inv] = await db.select().from(vdrInvitations).where(eq(vdrInvitations.tokenHash, hashToken(token)));
  return inv ?? null;
}

export function invitationState(inv: VdrInvitation | null): "ok" | "invalid" | "expired" | "revoked" | "accepted" {
  if (!inv) return "invalid";
  if (inv.status === "revoked") return "revoked";
  if (inv.status === "accepted") return "accepted";
  if (inv.expiresAt < new Date()) return "expired";
  return "ok";
}

/** 接受邀请：加入项目（项目用户）、设置权限组 / 机构 / 访问到期；外部分享则只开放该文件 */
export async function acceptInvitation(inv: VdrInvitation, user: User) {
  if (user.email.toLowerCase() !== inv.email) throw new Error("该邀请仅限受邀邮箱使用");
  const [m] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, inv.projectId), eq(projectMembers.userId, user.id)));
  if (!m) {
    await db.insert(projectMembers).values({
      projectId: inv.projectId, userId: user.id, role: "member", vdrGroup: inv.groupCode, organization: inv.organization,
      accessExpiresAt: inv.accessExpiresAt, invitedBy: inv.createdBy,
    });
  } else if (!inv.shareFileId) {
    await db.update(projectMembers).set({ vdrGroup: inv.groupCode ?? m.vdrGroup, organization: inv.organization ?? m.organization, accessExpiresAt: inv.accessExpiresAt })
      .where(and(eq(projectMembers.projectId, inv.projectId), eq(projectMembers.userId, user.id)));
  }
  if (inv.shareFileId && inv.shareCaps?.length) {
    await db.delete(vdrPermissions).where(and(eq(vdrPermissions.targetType, "file"), eq(vdrPermissions.targetId, inv.shareFileId), eq(vdrPermissions.subjectType, "user"), eq(vdrPermissions.subject, user.id)));
    await db.insert(vdrPermissions).values({
      projectId: inv.projectId, targetType: "file", targetId: inv.shareFileId, subjectType: "user", subject: user.id, level: levelOf(inv.shareCaps), caps: inv.shareCaps,
      expiresAt: inv.accessExpiresAt, updatedBy: inv.createdBy,
    });
  }
  await db.update(vdrInvitations).set({ status: "accepted", acceptedAt: new Date(), acceptedUserId: user.id }).where(eq(vdrInvitations.id, inv.id));
  await logVdr(inv.projectId, user.id, "invite_accept", { detail: { email: user.email, group: inv.groupCode } });
}
