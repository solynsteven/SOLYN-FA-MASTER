"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser, audit } from "@/lib/auth";
import { findInvitation, invitationState, acceptInvitation } from "@/lib/vdr/invites";
import { finishLogin } from "@/lib/login";

export type InviteState = { error?: string } | undefined;

const STATE_MSG = { invalid: "邀请链接无效", expired: "邀请链接已过期，请联系项目管理员重新发送", revoked: "该邀请已被作废", accepted: "该邀请已被使用" } as const;

/** 已登录且邮箱一致：直接接受 */
export async function acceptAsCurrent(token: string): Promise<InviteState> {
  const inv = await findInvitation(token);
  const st = invitationState(inv);
  if (st !== "ok") return { error: STATE_MSG[st] };
  const u = await getCurrentUser();
  if (!u) return { error: "请先登录" };
  try {
    await acceptInvitation(inv!, u);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  redirect(`/p/${inv!.projectId}/vdr`);
}

/** 新用户：设置姓名与密码，创建账号后接受邀请并登录 */
export async function acceptWithSignup(token: string, _: InviteState, fd: FormData): Promise<InviteState> {
  const inv = await findInvitation(token);
  const st = invitationState(inv);
  if (st !== "ok") return { error: STATE_MSG[st] };
  const name = String(fd.get("name") ?? "").trim();
  const pw = String(fd.get("password") ?? "");
  const pw2 = String(fd.get("password2") ?? "");
  if (!name) return { error: "请输入姓名" };
  if (pw.length < 10 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return { error: "密码至少 10 位，且需同时包含字母与数字" };
  if (pw !== pw2) return { error: "两次输入的密码不一致" };
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, inv!.email)).limit(1);
  if (exists) return { error: "该邮箱已有账号，请先登录后再接受邀请" };
  const [u] = await db.insert(users).values({ email: inv!.email, name, passwordHash: await bcrypt.hash(pw, 10), globalRole: "user" }).returning();
  await audit(u.id, "user.signup_invite", { invitation: inv!.id }, inv!.projectId);
  await acceptInvitation(inv!, u);
  await finishLogin(u, false);
  redirect(`/p/${inv!.projectId}/vdr`);
}
