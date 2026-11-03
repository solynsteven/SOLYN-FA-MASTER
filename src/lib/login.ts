import "server-only";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { createHash, randomInt } from "node:crypto";
import { db } from "@/db";
import { users, userDevices, userOtps, projectMembers, type User } from "@/db/schema";
import { createSession, deviceId } from "./session";
import { clientIp, userAgent } from "./net";
import { sendMail, mailHtml } from "./mail";
import { audit } from "./auth";
import { fmtDateTime } from "./format";
import { logVdr } from "./vdr/events";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function deviceLabel(ua: string) {
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Linux/.test(ua) ? "Linux" : "未知系统";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "浏览器";
  return `${br} · ${os}`;
}

/** 登录完成：建立会话；陌生设备时发告警邮件并在所参与项目的 VDR 安全日志留痕 */
export async function finishLogin(u: User, mfa: boolean) {
  const [did, ip, ua] = await Promise.all([deviceId(), clientIp(), userAgent()]);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
  await createSession({ sub: u.id, gr: u.globalRole }, { mfa, deviceId: did, ip, ua });
  const [known] = await db.select().from(userDevices).where(and(eq(userDevices.userId, u.id), eq(userDevices.deviceId, did)));
  if (known) {
    await db.update(userDevices).set({ lastSeenAt: new Date(), lastIp: ip || null }).where(eq(userDevices.id, known.id));
    return;
  }
  const [any] = await db.select({ id: userDevices.id }).from(userDevices).where(eq(userDevices.userId, u.id)).limit(1);
  await db.insert(userDevices).values({ userId: u.id, deviceId: did, userAgent: ua || null, firstIp: ip || null, lastIp: ip || null });
  if (!any) return; // 首次登录不告警
  const label = deviceLabel(ua);
  await audit(u.id, "security.new_device", { ip, ua: label });
  const projects = await db.select({ p: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, u.id));
  for (const { p } of projects) await logVdr(p, u.id, "new_device", { detail: { ip, device: label } }).catch(() => null);
  await sendMail(
    u.email,
    "【SOLYN FA MASTER】新设备登录提醒",
    mailHtml("检测到新设备登录您的账号", [
      `${u.name}，您的账号于 ${fmtDateTime(new Date())} 在一台新设备上登录。`,
      `设备：${label}　IP：${ip || "未知"}`,
      "如果这不是您本人操作，请立即修改密码，并联系项目管理员在「VDR 安全中心」强制下线该会话。",
    ]),
  );
}

/** 邮件验证码（MFA 兜底）：6 位，10 分钟有效，最多尝试 5 次 */
export async function sendEmailOtp(u: User) {
  const recent = await db.select().from(userOtps).where(and(eq(userOtps.userId, u.id), gt(userOtps.createdAt, new Date(Date.now() - 60_000)))).limit(1);
  if (recent.length) throw new Error("验证码已发送，请 1 分钟后再试");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(userOtps).values({ userId: u.id, purpose: "login", codeHash: sha(`${u.id}:${code}`), expiresAt: new Date(Date.now() + 10 * 60_000) });
  const r = await sendMail(u.email, "【SOLYN FA MASTER】登录验证码", mailHtml("登录验证码", [`您的验证码是：${code}`, "10 分钟内有效。如非本人操作，请忽略本邮件并尽快修改密码。"]));
  if (!r.sent) throw new Error(`邮件发送失败：${r.error}`);
}

export async function verifyEmailOtp(u: User, code: string) {
  const [o] = await db.select().from(userOtps)
    .where(and(eq(userOtps.userId, u.id), eq(userOtps.purpose, "login"), isNull(userOtps.usedAt), gt(userOtps.expiresAt, new Date())))
    .orderBy(desc(userOtps.createdAt)).limit(1);
  if (!o || o.attempts >= 5) return false;
  if (o.codeHash !== sha(`${u.id}:${code.trim()}`)) {
    await db.update(userOtps).set({ attempts: o.attempts + 1 }).where(eq(userOtps.id, o.id));
    return false;
  }
  await db.update(userOtps).set({ usedAt: new Date() }).where(eq(userOtps.id, o.id));
  return true;
}
