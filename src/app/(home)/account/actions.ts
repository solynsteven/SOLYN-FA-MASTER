"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { run } from "@/lib/action";

export async function changePassword(current: string, next: string) {
  return run(async () => {
    const u = await getCurrentUser();
    if (!u) throw new Error("请先登录");
    if (next.length < 8) throw new Error("新密码至少 8 位");
    if (!(await bcrypt.compare(current, u.passwordHash))) throw new Error("当前密码不正确");
    await db.update(users).set({ passwordHash: await bcrypt.hash(next, 10), updatedAt: new Date() }).where(eq(users.id, u.id));
  }, "密码已更新");
}

export async function updateProfile(name: string, title: string) {
  return run(async () => {
    const u = await getCurrentUser();
    if (!u) throw new Error("请先登录");
    if (!name.trim()) throw new Error("姓名不能为空");
    await db.update(users).set({ name: name.trim(), title: title.trim() || null, updatedAt: new Date() }).where(eq(users.id, u.id));
  }, "资料已保存");
}
