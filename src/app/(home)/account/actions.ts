"use server";

import bcrypt from "bcryptjs";
import { db } from "@/db";
import { run } from "@/lib/action";
import QRCode from "qrcode";
import { and, eq, ne, isNull } from "drizzle-orm";
import { users, userSessions } from "@/db/schema";
import { getCurrentUser, getCurrentSession } from "@/lib/auth";
import { newTotpSecret, verifyTotp, otpauthUrl } from "@/lib/totp";
import { encrypt, decrypt } from "@/lib/crypto";
import { audit } from "@/lib/auth";

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

/* ------------------------------ 二次验证（验证器 App） ------------------------------ */


export async function startMfaSetup() {
  return run(async () => {
    const u = await getCurrentUser();
    if (!u) throw new Error("请先登录");
    if (u.mfaEnabled) throw new Error("已开启二次验证");
    const secret = newTotpSecret();
    await db.update(users).set({ mfaSecret: encrypt(secret), updatedAt: new Date() }).where(eq(users.id, u.id));
    const url = otpauthUrl(secret, u.email);
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: "#16362A", light: "#FAF8F4" } });
    return { secret, qr };
  });
}

export async function confirmMfa(code: string) {
  return run(async () => {
    const u = await getCurrentUser();
    if (!u || !u.mfaSecret) throw new Error("请先生成二维码");
    if (!verifyTotp(decrypt(u.mfaSecret), code.replace(/\s/g, ""))) throw new Error("验证码不正确，请确认手机时间准确后重试");
    await db.update(users).set({ mfaEnabled: true, mfaEnabledAt: new Date(), updatedAt: new Date() }).where(eq(users.id, u.id));
    const s = await getCurrentSession();
    if (s) await db.update(userSessions).set({ mfa: true }).where(eq(userSessions.id, s.id));
    await audit(u.id, "security.mfa_enable", {});
  }, "二次验证已开启");
}

export async function disableMfa(code: string) {
  return run(async () => {
    const u = await getCurrentUser();
    if (!u || !u.mfaEnabled || !u.mfaSecret) throw new Error("尚未开启二次验证");
    if (!verifyTotp(decrypt(u.mfaSecret), code.replace(/\s/g, ""))) throw new Error("验证码不正确");
    await db.update(users).set({ mfaEnabled: false, mfaSecret: null, mfaEnabledAt: null, updatedAt: new Date() }).where(eq(users.id, u.id));
    await audit(u.id, "security.mfa_disable", {});
  }, "已关闭二次验证（访问要求 MFA 的数据室时将被拦截）");
}

export async function revokeMyOtherSessions() {
  return run(async () => {
    const u = await getCurrentUser();
    const s = await getCurrentSession();
    if (!u || !s) throw new Error("请先登录");
    const r = await db.update(userSessions).set({ revokedAt: new Date(), revokeReason: "self" })
      .where(and(eq(userSessions.userId, u.id), ne(userSessions.id, s.id), isNull(userSessions.revokedAt))).returning({ id: userSessions.id });
    return r.length;
  }, "已退出其他设备上的登录");
}
