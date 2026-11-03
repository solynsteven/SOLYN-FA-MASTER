import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { vdrIrmIssues, type VdrIrmIssue } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { vdrContext } from "./access";
import { logVdr } from "./events";
import { clientIp } from "@/lib/net";

export type IrmCheck = { ok: true; issue: VdrIrmIssue; watermark: string; isManager: boolean } | { ok: false; status: number; error: string; issue?: VdrIrmIssue };

/** IRM 受控文件联网验权：收件人本人 + 未撤销 + 未过期 + 仍能通过数据室门禁 */
export async function checkIrm(id: string): Promise<IrmCheck> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, status: 400, error: "文件标识无效" };
  const user = await getCurrentUser();
  if (!user) return { ok: false, status: 401, error: "请先登录 FA MASTER" };
  const [issue] = await db.select().from(vdrIrmIssues).where(eq(vdrIrmIssues.id, id));
  if (!issue || issue.kind !== "package") return { ok: false, status: 404, error: "未找到该受控文件的授权记录" };
  const ctx = await vdrContext(issue.projectId);
  const isManager = !!ctx?.isManager;
  const deny = async (status: number, error: string) => {
    await logVdr(issue.projectId, user.id, "irm_denied", { fileId: issue.fileId, detail: { issueId: issue.id, reason: error } }).catch(() => null);
    return { ok: false as const, status, error, issue };
  };
  if (issue.userId !== user.id && !isManager) return deny(403, "该受控文件仅限收件人本人打开，请使用收件人账号登录");
  if (issue.revokedAt) return deny(410, `该文件已被管理员远程撤销（${issue.revokedAt.toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" })}），无法再打开`);
  if (issue.policy.expiresAt && new Date(issue.policy.expiresAt) < new Date()) return deny(410, `该文件已于 ${new Date(issue.policy.expiresAt).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" })} 到期`);
  if (!ctx) return deny(403, "您已不再是该项目成员，无法打开");
  if (ctx.fail && !isManager) return deny(403, ctx.fail.message);
  return { ok: true, issue, watermark: ctx.watermark, isManager };
}

export async function markOpened(issue: VdrIrmIssue) {
  const ip = await clientIp();
  await db.update(vdrIrmIssues).set({ openCount: issue.openCount + 1, lastOpenedAt: new Date(), lastIp: ip || null }).where(eq(vdrIrmIssues.id, issue.id));
}
