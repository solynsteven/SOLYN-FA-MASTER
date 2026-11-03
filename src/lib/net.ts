import "server-only";
import { headers } from "next/headers";

/** 客户端 IP（Vercel：x-forwarded-for 第一个值） */
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    return ((h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "").replace(/^::ffff:/, "");
  } catch {
    return "";
  }
}
export async function userAgent(): Promise<string> {
  try {
    return ((await headers()).get("user-agent") ?? "").slice(0, 300);
  } catch {
    return "";
  }
}

function v4ToInt(ip: string) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}
function v6ToBig(ip: string): bigint | null {
  if (!ip.includes(":")) return null;
  let [head, tail] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  if (tail === undefined && h.length !== 8) return null;
  const parts = tail === undefined ? h : [...h, ...Array(8 - h.length - t.length).fill("0"), ...t];
  if (parts.length !== 8) return null;
  let n = 0n;
  for (const x of parts) { const v = parseInt(x || "0", 16); if (Number.isNaN(v)) return null; n = (n << 16n) + BigInt(v); }
  return n;
}

/** 单个 IP 或 CIDR 规则是否匹配（支持 IPv4 / IPv6） */
export function ipMatches(ip: string, rule: string) {
  const [base, bitsS] = rule.trim().split("/");
  if (!base) return false;
  const a4 = v4ToInt(ip), b4 = v4ToInt(base);
  if (a4 !== null && b4 !== null) {
    const bits = bitsS === undefined ? 32 : Number(bitsS);
    if (!(bits >= 0 && bits <= 32)) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return ((a4 & mask) >>> 0) === ((b4 & mask) >>> 0);
  }
  const a6 = v6ToBig(ip), b6 = v6ToBig(base);
  if (a6 !== null && b6 !== null) {
    const bits = BigInt(bitsS === undefined ? 128 : Number(bitsS));
    const mask = bits === 0n ? 0n : ((1n << 128n) - 1n) ^ ((1n << (128n - bits)) - 1n);
    return (a6 & mask) === (b6 & mask);
  }
  return false;
}
export const ipAllowed = (ip: string, rules: string[] | undefined) => !rules?.length || rules.some((r) => ipMatches(ip, r));

export function isValidIpRule(rule: string) {
  const [base, bits] = rule.trim().split("/");
  if (v4ToInt(base) !== null) return bits === undefined || (Number(bits) >= 0 && Number(bits) <= 32);
  if (v6ToBig(base) !== null) return bits === undefined || (Number(bits) >= 0 && Number(bits) <= 128);
  return false;
}
