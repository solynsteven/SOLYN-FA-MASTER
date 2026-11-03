import Link from "next/link";
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { users, projectMembers, userSessions, vdrInvitations, vdrNdaSignatures, vdrIrmIssues, vdrEvents, vdrFiles } from "@/db/schema";
import { requireProject } from "@/lib/auth";
import { listGroups, getVdrSettings, WM_FIELD_LABEL, watermarkText } from "@/lib/vdr/groups";
import { mailEnabled } from "@/lib/mail";
import { clientIp } from "@/lib/net";
import { PageHeader } from "@/components/PageHeader";
import { SecurityCenter } from "./SecurityCenter";

export const metadata = { title: "VDR 安全中心" };
export const dynamic = "force-dynamic";

const SEC_ACTIONS = ["access_denied", "new_device", "session_revoke", "nda_sign", "invite", "invite_accept", "invite_revoke", "group_update", "member_update", "settings_update", "security", "permission",
  "irm_open", "irm_print", "irm_revoke", "irm_update", "irm_denied", "irm_password_view", "download_watermark", "download_irm", "download_encrypted", "download_original", "share"];

export default async function VdrSecurityPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { projectId } = await params;
  const { tab } = await searchParams;
  const { project, user } = await requireProject(projectId, { module: "vdr", manage: true });
  const [groups, settings, ip] = await Promise.all([listGroups(projectId), getVdrSettings(projectId), clientIp()]);

  const members = await db.select({
    userId: users.id, name: users.name, email: users.email, isActive: users.isActive, mfa: users.mfaEnabled, lastLoginAt: users.lastLoginAt,
    role: projectMembers.role, group: projectMembers.vdrGroup, organization: projectMembers.organization, accessExpiresAt: projectMembers.accessExpiresAt,
  }).from(projectMembers).innerJoin(users, eq(users.id, projectMembers.userId)).where(eq(projectMembers.projectId, projectId)).orderBy(users.name);
  const uids = members.map((m) => m.userId);
  const [sessions, sigs, invites, issues, events] = await Promise.all([
    uids.length ? db.select().from(userSessions).where(and(inArray(userSessions.userId, uids), isNull(userSessions.revokedAt), gt(userSessions.lastSeenAt, new Date(Date.now() - 12 * 3600_000)))).orderBy(desc(userSessions.lastSeenAt)) : [],
    db.select({ id: vdrNdaSignatures.id, userId: vdrNdaSignatures.userId, version: vdrNdaSignatures.version, signedName: vdrNdaSignatures.signedName, signedAt: vdrNdaSignatures.signedAt, ip: vdrNdaSignatures.ip, hash: vdrNdaSignatures.contentHash, name: users.name, email: users.email })
      .from(vdrNdaSignatures).innerJoin(users, eq(users.id, vdrNdaSignatures.userId)).where(eq(vdrNdaSignatures.projectId, projectId)).orderBy(desc(vdrNdaSignatures.signedAt)).limit(500),
    db.select().from(vdrInvitations).where(eq(vdrInvitations.projectId, projectId)).orderBy(desc(vdrInvitations.createdAt)).limit(200),
    db.select({ i: vdrIrmIssues, name: users.name, email: users.email }).from(vdrIrmIssues).innerJoin(users, eq(users.id, vdrIrmIssues.userId)).where(eq(vdrIrmIssues.projectId, projectId)).orderBy(desc(vdrIrmIssues.createdAt)).limit(500),
    db.select({ e: vdrEvents, name: users.name }).from(vdrEvents).leftJoin(users, eq(users.id, vdrEvents.userId)).where(and(eq(vdrEvents.projectId, projectId), inArray(vdrEvents.action, SEC_ACTIONS))).orderBy(desc(vdrEvents.createdAt)).limit(400),
  ]);
  const fileIds = [...new Set([...issues.map((x) => x.i.fileId), ...invites.map((x) => x.shareFileId).filter(Boolean) as string[], ...events.map((x) => x.e.fileId).filter(Boolean) as string[]])];
  const fileNames = new Map((fileIds.length ? await db.select({ id: vdrFiles.id, name: vdrFiles.name }).from(vdrFiles).where(inArray(vdrFiles.id, fileIds)) : []).map((f) => [f.id, f.name]));
  const now = Date.now();

  return (
    <>
      <Link href={`/p/${projectId}/vdr`} className="mb-3 inline-flex items-center gap-1.5 text-xs text-brand-sage hover:text-brand-paper"><ArrowLeft size={13} />返回 VDR</Link>
      <PageHeader eyebrow={`${project.code} · VDR Security Center`} title="VDR 安全中心"
        desc="权限组与准入风控、邀请制账号、NDA 前置签署、动态水印与下载策略、IRM 受控副本远程撤销，以及全部安全事件留痕。" />
      <SecurityCenter
        projectId={projectId}
        meId={user.id}
        meName={user.name}
        meEmail={user.email}
        initialTab={tab ?? "groups"}
        mailEnabled={mailEnabled()}
        myIp={ip}
        groups={groups.map((g) => ({ id: g.id, code: g.code, name: g.name, description: g.description ?? "", kind: g.kind, caps: g.defaultCaps, policy: g.policy, members: members.filter((m) => m.group === g.code).length }))}
        members={members.map((m) => {
          const ss = sessions.filter((s) => s.userId === m.userId);
          return {
            userId: m.userId, name: m.name, email: m.email, isActive: m.isActive, mfa: m.mfa, role: m.role, group: m.group, organization: m.organization,
            accessExpiresAt: m.accessExpiresAt?.toISOString() ?? null, lastLoginAt: m.lastLoginAt?.toISOString() ?? null,
            sessions: ss.map((s) => ({ id: s.id, ip: s.ip, ua: s.userAgent, mfa: s.mfa, lastSeenAt: s.lastSeenAt.toISOString(), createdAt: s.createdAt.toISOString() })),
            ndaSigned: sigs.some((s) => s.userId === m.userId && s.version === settings.ndaVersion),
          };
        })}
        invites={invites.map((v) => ({
          id: v.id, email: v.email, name: v.name, group: v.groupCode, organization: v.organization, status: v.status === "pending" && v.expiresAt.getTime() < now ? "expired" : v.status,
          expiresAt: v.expiresAt.toISOString(), accessExpiresAt: v.accessExpiresAt?.toISOString() ?? null, createdAt: v.createdAt.toISOString(), acceptedAt: v.acceptedAt?.toISOString() ?? null,
          shareFile: v.shareFileId ? fileNames.get(v.shareFileId) ?? "（已删除的文件）" : null,
        }))}
        settings={settings}
        wmFieldLabels={WM_FIELD_LABEL}
        wmSample={watermarkText(settings.watermark, { name: user.name, email: user.email, org: "Solyn Advisory", ip, projectName: project.name, projectCode: project.code, projectId })}
        signatures={sigs.map((s) => ({ id: s.id, userId: s.userId, name: s.name, email: s.email, version: s.version, signedName: s.signedName, signedAt: s.signedAt.toISOString(), ip: s.ip, hash: s.hash }))}
        issues={issues.map(({ i, name, email }) => ({
          id: i.id, kind: i.kind, fileName: i.fileName, file: fileNames.get(i.fileId) ?? i.fileName, userId: i.userId, user: name, email, policy: i.policy, printsUsed: i.printsUsed,
          openCount: i.openCount, lastOpenedAt: i.lastOpenedAt?.toISOString() ?? null, lastIp: i.lastIp, revokedAt: i.revokedAt?.toISOString() ?? null, revokeReason: i.revokeReason,
          createdAt: i.createdAt.toISOString(), hasPassword: !!i.passwordEnc,
          expired: i.kind === "package" && !!i.policy.expiresAt && new Date(i.policy.expiresAt).getTime() < now,
        }))}
        events={events.map(({ e, name }) => ({ id: e.id, action: e.action, user: name ?? "—", file: e.fileId ? fileNames.get(e.fileId) ?? null : null, detail: e.detail, ip: e.ip, at: e.createdAt.toISOString() }))}
      />
    </>
  );
}
