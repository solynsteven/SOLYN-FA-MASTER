"use server";

import { and, eq, isNull, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { vdrGroups, vdrSettings, vdrInvitations, vdrIrmIssues, projectMembers, userSessions, vdrPermissions, type VdrCap, type VdrGroupPolicy, type VdrSettingsData, type VdrDownloadMode, type WatermarkField } from "@/db/schema";
import { run } from "@/lib/action";
import { requireVdr } from "@/lib/vdr/access";
import { listGroups, getVdrSettings } from "@/lib/vdr/groups";
import { createInvitation } from "@/lib/vdr/invites";
import { normCaps, levelOf, ALL_CAPS } from "@/lib/vdr/caps";
import { logVdr } from "@/lib/vdr/events";
import { isValidIpRule } from "@/lib/net";
import { decrypt } from "@/lib/crypto";

async function mgr(projectId: string) {
  const c = await requireVdr(projectId, { manage: true });
  return c.access.user;
}
const refresh = (projectId: string) => {
  revalidatePath(`/p/${projectId}/vdr`, "layout");
  revalidatePath(`/p/${projectId}/settings`);
};
const toDate = (s: string | null | undefined) => {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error("日期格式不正确");
  return d;
};

/* ------------------------------ 权限组 ------------------------------ */

export type GroupInput = {
  id?: string; code: string; name: string; description?: string; kind: "internal" | "seller" | "buyer" | "advisor" | "custom";
  caps: VdrCap[]; policy: VdrGroupPolicy;
};

export async function saveGroup(projectId: string, g: GroupInput) {
  return run(async () => {
    const actor = await mgr(projectId);
    const code = g.code.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,11}$/.test(code)) throw new Error("组代码须为 2–12 位大写字母 / 数字，以字母开头");
    const name = g.name.trim();
    if (!name) throw new Error("请填写组名称");
    const caps = normCaps(g.caps.filter((c) => ALL_CAPS.includes(c)));
    const p = g.policy ?? {};
    const ipAllowlist = (p.ipAllowlist ?? []).map((s) => s.trim()).filter(Boolean);
    const bad = ipAllowlist.find((r) => !isValidIpRule(r));
    if (bad) throw new Error(`IP 规则无效：${bad}`);
    const emailDomains = (p.emailDomains ?? []).map((s) => s.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
    const badD = emailDomains.find((d) => !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d));
    if (badD) throw new Error(`邮箱域名无效：${badD}`);
    const w = p.window && (p.window.days?.length || p.window.start || p.window.end) ? {
      days: (p.window.days ?? []).filter((d) => d >= 1 && d <= 7), start: p.window.start || "00:00", end: p.window.end || "24:00", tz: p.window.tz || "Asia/Tokyo",
    } : null;
    if (w && (!/^\d\d:\d\d$/.test(w.start) || !/^\d\d:\d\d$/.test(w.end))) throw new Error("访问时段格式应为 HH:MM");
    const from = toDate(p.accessFrom), until = toDate(p.accessUntil);
    if (from && until && from >= until) throw new Error("访问开始时间须早于到期时间");
    const policy: VdrGroupPolicy = {
      requireMfa: !!p.requireMfa, ipAllowlist, emailDomains, window: w,
      accessFrom: from?.toISOString() ?? null, accessUntil: until?.toISOString() ?? null,
      maxSessions: p.maxSessions && p.maxSessions > 0 ? Math.min(20, Math.floor(p.maxSessions)) : null,
    };
    const values = { code, name, description: g.description?.trim() || null, kind: g.kind, defaultCaps: caps, defaultLevel: levelOf(caps), policy, updatedAt: new Date() };
    if (g.id) {
      const [old] = await db.select().from(vdrGroups).where(and(eq(vdrGroups.id, g.id), eq(vdrGroups.projectId, projectId)));
      if (!old) throw new Error("权限组不存在");
      if (old.code !== code) {
        // 代码变更：同步成员与权限规则
        await db.update(projectMembers).set({ vdrGroup: code }).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.vdrGroup, old.code)));
        await db.update(vdrPermissions).set({ subject: code }).where(and(eq(vdrPermissions.projectId, projectId), eq(vdrPermissions.subjectType, "group"), eq(vdrPermissions.subject, old.code)));
      }
      await db.update(vdrGroups).set(values).where(eq(vdrGroups.id, g.id));
    } else {
      const n = (await listGroups(projectId)).length;
      await db.insert(vdrGroups).values({ projectId, ...values, sortOrder: (n + 1) * 10 });
    }
    await logVdr(projectId, actor.id, "group_update", { detail: { code, caps, policy } });
    refresh(projectId);
  }, "权限组已保存");
}

export async function deleteGroup(projectId: string, id: string) {
  return run(async () => {
    const actor = await mgr(projectId);
    const [g] = await db.select().from(vdrGroups).where(and(eq(vdrGroups.id, id), eq(vdrGroups.projectId, projectId)));
    if (!g) throw new Error("权限组不存在");
    if (g.code === "ADM") throw new Error("内部管理层组不能删除");
    const used = await db.select({ u: projectMembers.userId }).from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.vdrGroup, g.code))).limit(1);
    if (used.length) throw new Error("该组仍有成员，请先调整成员的权限组");
    await db.delete(vdrPermissions).where(and(eq(vdrPermissions.projectId, projectId), eq(vdrPermissions.subjectType, "group"), eq(vdrPermissions.subject, g.code)));
    await db.delete(vdrGroups).where(eq(vdrGroups.id, id));
    await logVdr(projectId, actor.id, "group_update", { detail: { code: g.code, deleted: true } });
    refresh(projectId);
  }, "已删除");
}

/* ------------------------------ 成员 / 会话 / 邀请 ------------------------------ */

export async function updateMemberAccess(projectId: string, userId: string, input: { group: string | null; organization: string | null; accessExpiresAt: string | null }) {
  return run(async () => {
    const actor = await mgr(projectId);
    const codes = (await listGroups(projectId)).map((g) => g.code);
    if (input.group && !codes.includes(input.group)) throw new Error("未知权限组");
    await db.update(projectMembers).set({ vdrGroup: input.group || null, organization: input.organization?.trim() || null, accessExpiresAt: toDate(input.accessExpiresAt) })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    await logVdr(projectId, actor.id, "member_update", { detail: { userId, ...input } });
    refresh(projectId);
  }, "已保存");
}

export async function revokeSessions(projectId: string, userId: string) {
  return run(async () => {
    const actor = await mgr(projectId);
    if (userId === actor.id) throw new Error("不能强制下线自己");
    const [m] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    if (!m) throw new Error("该用户不是本项目成员");
    const r = await db.update(userSessions).set({ revokedAt: new Date(), revokeReason: "admin" }).where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt))).returning({ id: userSessions.id });
    await logVdr(projectId, actor.id, "session_revoke", { detail: { userId, count: r.length, reason: "admin" } });
    refresh(projectId);
    return r.length;
  }, "已强制下线该用户的全部会话");
}

export async function inviteMember(projectId: string, input: { email: string; name: string; group: string; organization: string; accessExpiresAt: string | null; linkDays: number; note: string }) {
  return run(async () => {
    const actor = await mgr(projectId);
    if (!input.group) throw new Error("请选择权限组");
    const r = await createInvitation({
      projectId, email: input.email, name: input.name.trim() || null, groupCode: input.group, organization: input.organization.trim() || null,
      accessExpiresAt: toDate(input.accessExpiresAt), linkDays: Math.min(30, Math.max(1, input.linkDays || 7)), note: input.note.trim() || null, actor,
    });
    refresh(projectId);
    return { link: r.link, mailed: r.mailed, mailError: r.mailError ?? null };
  });
}

/** 重新发送：作废旧链接并以相同条件生成新链接 */
export async function resendInvitation(projectId: string, id: string) {
  return run(async () => {
    const actor = await mgr(projectId);
    const [inv] = await db.select().from(vdrInvitations).where(and(eq(vdrInvitations.id, id), eq(vdrInvitations.projectId, projectId)));
    if (!inv || inv.status === "accepted") throw new Error("该邀请不可重发");
    const r = await createInvitation({
      projectId, email: inv.email, name: inv.name, groupCode: inv.groupCode, organization: inv.organization, accessExpiresAt: inv.accessExpiresAt,
      linkDays: 7, shareFileId: inv.shareFileId, shareCaps: inv.shareCaps, note: inv.note, actor,
    });
    refresh(projectId);
    return { link: r.link, mailed: r.mailed, mailError: r.mailError ?? null };
  });
}

export async function revokeInvitation(projectId: string, id: string) {
  return run(async () => {
    const actor = await mgr(projectId);
    await db.update(vdrInvitations).set({ status: "revoked" }).where(and(eq(vdrInvitations.id, id), eq(vdrInvitations.projectId, projectId), eq(vdrInvitations.status, "pending")));
    await logVdr(projectId, actor.id, "invite_revoke", { detail: { id } });
    refresh(projectId);
  }, "邀请已作废");
}

/* ------------------------------ NDA ------------------------------ */

export async function saveNda(projectId: string, input: { required: boolean; title: string; template: string; bump: boolean }) {
  return run(async () => {
    const actor = await mgr(projectId);
    const cur = await getVdrSettings(projectId);
    const title = input.title.trim() || cur.ndaTitle;
    const template = input.template.trim();
    if (input.required && template.length < 20) throw new Error("NDA 正文过短");
    const changed = title !== cur.ndaTitle || template !== cur.ndaTemplate.trim();
    const version = input.bump || (changed && cur.ndaRequired) ? cur.ndaVersion + 1 : cur.ndaVersion;
    await db.insert(vdrSettings).values({ projectId, ndaRequired: input.required, ndaTitle: title, ndaTemplate: template, ndaVersion: version, updatedBy: actor.id })
      .onConflictDoUpdate({ target: vdrSettings.projectId, set: { ndaRequired: input.required, ndaTitle: title, ndaTemplate: template, ndaVersion: version, updatedBy: actor.id, updatedAt: new Date() } });
    await logVdr(projectId, actor.id, "settings_update", { detail: { nda: { required: input.required, version } } });
    refresh(projectId);
    return version;
  }, "NDA 设置已保存");
}

/* ------------------------------ 水印与文档安全 ------------------------------ */

export async function saveSecuritySettings(projectId: string, input: {
  watermark: { fields: WatermarkField[]; opacity: number; size: number; density: number; customText: string };
  download: { modes: VdrDownloadMode[]; irmExpiryDays: number; irmPrintLimit: number };
  requireMfa: boolean;
}) {
  return run(async () => {
    const actor = await mgr(projectId);
    const w = input.watermark;
    const data: VdrSettingsData = {
      watermark: {
        fields: w.fields, opacity: Math.min(0.5, Math.max(0.05, w.opacity)), size: Math.min(40, Math.max(10, Math.round(w.size))),
        density: Math.min(3, Math.max(0.5, w.density)), customText: w.customText.slice(0, 60),
      },
      download: {
        modes: input.download.modes.filter((m) => ["watermark", "irm", "encrypted", "original"].includes(m)),
        irmExpiryDays: Math.min(365, Math.max(1, Math.round(input.download.irmExpiryDays))), irmPrintLimit: Math.min(99, Math.max(0, Math.round(input.download.irmPrintLimit))),
      },
      requireMfa: input.requireMfa,
    };
    if (!data.watermark!.fields!.length && !data.watermark!.customText) throw new Error("请至少选择一个水印字段");
    await db.insert(vdrSettings).values({ projectId, data, updatedBy: actor.id })
      .onConflictDoUpdate({ target: vdrSettings.projectId, set: { data, updatedBy: actor.id, updatedAt: new Date() } });
    await logVdr(projectId, actor.id, "settings_update", { detail: { watermark: data.watermark, download: data.download, requireMfa: data.requireMfa } });
    refresh(projectId);
  }, "安全设置已保存");
}

/* ------------------------------ 受控副本（IRM） ------------------------------ */

export async function revokeIrm(projectId: string, ids: string[], reason: string) {
  return run(async () => {
    const actor = await mgr(projectId);
    if (!ids.length) throw new Error("未选择副本");
    const r = await db.update(vdrIrmIssues).set({ revokedAt: new Date(), revokedBy: actor.id, revokeReason: reason.trim() || "管理员撤销" })
      .where(and(eq(vdrIrmIssues.projectId, projectId), inArray(vdrIrmIssues.id, ids), isNull(vdrIrmIssues.revokedAt))).returning({ id: vdrIrmIssues.id, fileId: vdrIrmIssues.fileId });
    for (const x of r) await logVdr(projectId, actor.id, "irm_revoke", { fileId: x.fileId, detail: { issueId: x.id, reason } });
    refresh(projectId);
    return r.length;
  }, "已远程撤销");
}

export async function revokeIrmOfUser(projectId: string, userId: string) {
  return run(async () => {
    const actor = await mgr(projectId);
    const r = await db.update(vdrIrmIssues).set({ revokedAt: new Date(), revokedBy: actor.id, revokeReason: "撤销该用户全部受控副本" })
      .where(and(eq(vdrIrmIssues.projectId, projectId), eq(vdrIrmIssues.userId, userId), eq(vdrIrmIssues.kind, "package"), isNull(vdrIrmIssues.revokedAt))).returning({ id: vdrIrmIssues.id });
    await logVdr(projectId, actor.id, "irm_revoke", { detail: { userId, count: r.length } });
    refresh(projectId);
    return r.length;
  }, "已撤销该用户的全部受控副本");
}

export async function updateIrmPolicy(projectId: string, id: string, input: { expiresAt: string | null; printLimit: number }) {
  return run(async () => {
    const actor = await mgr(projectId);
    const [iss] = await db.select().from(vdrIrmIssues).where(and(eq(vdrIrmIssues.id, id), eq(vdrIrmIssues.projectId, projectId)));
    if (!iss || iss.kind !== "package") throw new Error("只能调整受控文件包的策略");
    const exp = toDate(input.expiresAt);
    await db.update(vdrIrmIssues).set({ policy: { ...iss.policy, expiresAt: exp?.toISOString() ?? null, printLimit: Math.max(0, Math.floor(input.printLimit)) } }).where(eq(vdrIrmIssues.id, id));
    await logVdr(projectId, actor.id, "irm_update", { fileId: iss.fileId, detail: { issueId: id, ...input } });
    refresh(projectId);
  }, "策略已更新，下次联网验权时生效");
}

export async function restoreIrm(projectId: string, id: string) {
  return run(async () => {
    const actor = await mgr(projectId);
    await db.update(vdrIrmIssues).set({ revokedAt: null, revokedBy: null, revokeReason: null }).where(and(eq(vdrIrmIssues.id, id), eq(vdrIrmIssues.projectId, projectId)));
    await logVdr(projectId, actor.id, "irm_update", { detail: { issueId: id, restored: true } });
    refresh(projectId);
  }, "已恢复");
}

export async function irmPassword(projectId: string, id: string) {
  return run(async () => {
    const actor = await mgr(projectId);
    const [iss] = await db.select().from(vdrIrmIssues).where(and(eq(vdrIrmIssues.id, id), eq(vdrIrmIssues.projectId, projectId)));
    if (!iss?.passwordEnc) throw new Error("该副本没有打开密码");
    await logVdr(projectId, actor.id, "irm_password_view", { fileId: iss.fileId, detail: { issueId: id } });
    return decrypt(iss.passwordEnc);
  });
}
