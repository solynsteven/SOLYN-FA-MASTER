import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { userSessions } from "@/db/schema";

export const SESSION_COOKIE = "solyn_session";
export const DEVICE_COOKIE = "solyn_did";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 天

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET 未设置或长度不足 32 位");
  return new TextEncoder().encode(s);
}

/** sid = user_sessions 行 id：服务端可随时撤销（强制下线、并发控制） */
export type SessionPayload = { sub: string; gr: "super_admin" | "user"; sid?: string };

const cookieOpts = (maxAge: number) => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge });

/** 设备标识：长期 cookie，用于陌生设备识别 */
export async function deviceId() {
  const jar = await cookies();
  let d = jar.get(DEVICE_COOKIE)?.value;
  if (!d || !/^[0-9a-f-]{36}$/.test(d)) {
    d = randomUUID();
    jar.set(DEVICE_COOKIE, d, cookieOpts(60 * 60 * 24 * 400));
  }
  return d;
}

export async function createSession(payload: { sub: string; gr: "super_admin" | "user" }, meta: { mfa: boolean; deviceId: string; ip: string; ua: string }) {
  const [row] = await db.insert(userSessions).values({ userId: payload.sub, mfa: meta.mfa, deviceId: meta.deviceId, ip: meta.ip || null, userAgent: meta.ua || null }).returning();
  const token = await new SignJWT({ ...payload, sid: row.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(SESSION_COOKIE, token, cookieOpts(MAX_AGE));
  return row;
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function destroySession() {
  const s = await readSession();
  if (s?.sid) await db.update(userSessions).set({ revokedAt: new Date(), revokeReason: "logout" }).where(and(eq(userSessions.id, s.sid), isNull(userSessions.revokedAt)));
  (await cookies()).delete(SESSION_COOKIE);
}

/* ---------------- 二次验证进行中（密码已通过，等待 MFA） ---------------- */
const MFA_COOKIE = "solyn_mfa";
export async function setMfaPending(userId: string, next: string) {
  const t = await new SignJWT({ u: userId, n: next }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(secret());
  (await cookies()).set(MFA_COOKIE, t, cookieOpts(600));
}
export async function readMfaPending(): Promise<{ userId: string; next: string } | null> {
  const t = (await cookies()).get(MFA_COOKIE)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, secret());
    return { userId: String(payload.u), next: String(payload.n ?? "/") };
  } catch {
    return null;
  }
}
export async function clearMfaPending() {
  (await cookies()).delete(MFA_COOKIE);
}
