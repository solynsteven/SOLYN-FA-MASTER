import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/** AES-256-GCM 加密 API Key。ENCRYPTION_KEY 为 32 字节 base64；未设置时退回用 AUTH_SECRET 派生 */
function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (raw) {
    const buf = Buffer.from(raw, "base64");
    if (buf.length === 32) return buf;
    return createHash("sha256").update(raw).digest();
  }
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("缺少 ENCRYPTION_KEY / AUTH_SECRET");
  return createHash("sha256").update("solyn-enc:" + s).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((s) => Buffer.from(s, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
