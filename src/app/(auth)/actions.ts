"use server";

import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, destroySession } from "@/lib/session";
import { audit } from "@/lib/auth";

export type FormState = { error?: string } | undefined;

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const next = String(fd.get("next") ?? "/");
  if (!email || !password) return { error: "请输入邮箱和密码" };
  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const ok = u ? await bcrypt.compare(password, u.passwordHash) : false;
  if (!u || !ok) {
    await new Promise((r) => setTimeout(r, 600));
    return { error: "邮箱或密码不正确" };
  }
  if (!u.isActive) return { error: "该账号已被停用，请联系管理员" };
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
  await createSession({ sub: u.id, gr: u.globalRole });
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function hasAnyUser() {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  return (r?.n ?? 0) > 0;
}

const setupSchema = z.object({
  name: z.string().trim().min(1, "请输入姓名"),
  email: z.string().trim().toLowerCase().email("邮箱格式不正确"),
  password: z.string().min(8, "密码至少 8 位"),
});

/** 首次部署：系统中没有任何用户时，创建第一个全局管理员 */
export async function setupAction(_: FormState, fd: FormData): Promise<FormState> {
  if (await hasAnyUser()) return { error: "系统已初始化，请直接登录" };
  const p = setupSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  if (fd.get("password") !== fd.get("confirm")) return { error: "两次输入的密码不一致" };
  const [u] = await db
    .insert(users)
    .values({ name: p.data.name, email: p.data.email, passwordHash: await bcrypt.hash(p.data.password, 10), globalRole: "super_admin" })
    .returning();
  await audit(u.id, "system.setup", { email: u.email });
  await createSession({ sub: u.id, gr: "super_admin" });
  redirect("/");
}
