import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, projects, vdrFiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { findInvitation, invitationState } from "@/lib/vdr/invites";
import { listGroups } from "@/lib/vdr/groups";
import { AuthShell } from "../../AuthShell";
import { InviteForms } from "./InviteForms";

export const metadata = { title: "接受邀请" };
export const dynamic = "force-dynamic";

const MSG = { invalid: "邀请链接无效或已被替换。", expired: "邀请链接已过期，请联系项目管理员重新发送。", revoked: "该邀请已被作废。", accepted: "该邀请已被使用。如您已设置账号，请直接登录。" } as const;

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await findInvitation(token);
  const st = invitationState(inv);
  if (st !== "ok" || !inv) {
    return (
      <AuthShell>
        <h2 className="text-xl font-medium text-brand-pine">无法使用该邀请</h2>
        <p className="mb-6 mt-2 text-sm leading-relaxed text-brand-sage">{MSG[st as keyof typeof MSG]}</p>
        <Link href="/login" className="text-sm text-brand-green underline">前往登录</Link>
      </AuthShell>
    );
  }
  const [[p], me, [existing], groups] = await Promise.all([
    db.select({ name: projects.name }).from(projects).where(eq(projects.id, inv.projectId)),
    getCurrentUser(),
    db.select({ id: users.id }).from(users).where(eq(users.email, inv.email)).limit(1),
    listGroups(inv.projectId),
  ]);
  const g = groups.find((x) => x.code === inv.groupCode);
  const [file] = inv.shareFileId ? await db.select({ name: vdrFiles.name }).from(vdrFiles).where(eq(vdrFiles.id, inv.shareFileId)) : [];
  const mode = me ? (me.email.toLowerCase() === inv.email ? "accept" : "mismatch") : existing ? "login" : "signup";
  return (
    <AuthShell>
      <div className="eyebrow mb-2 text-brand-sage">Invitation</div>
      <h2 className="text-xl font-medium text-brand-pine">访问「{p?.name}」数据室</h2>
      <div className="mb-6 mt-3 space-y-1 rounded-md bg-brand-mist/40 px-3.5 py-3 text-xs leading-relaxed text-brand-pine">
        <div>受邀邮箱：<b>{inv.email}</b></div>
        {file ? <div>分享文件：{file.name}</div> : g && <div>权限组：{g.name}</div>}
        {inv.organization && <div>所属机构：{inv.organization}</div>}
        {inv.accessExpiresAt && <div>访问到期：{inv.accessExpiresAt.toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" })}</div>}
        <div className="pt-1 text-brand-sage">账号仅限本人使用。所有访问、预览与下载均会记录，并嵌入您的身份水印。</div>
      </div>
      <InviteForms token={token} mode={mode} email={inv.email} name={inv.name ?? ""} meEmail={me?.email ?? null} />
    </AuthShell>
  );
}
