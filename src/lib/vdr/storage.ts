import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { get, del, head } from "@vercel/blob";

/**
 * 文件存储：
 *  - 生产：Vercel Blob（BLOB_READ_WRITE_TOKEN 由 Vercel Blob 集成自动注入），默认私有访问，
 *    所有读取都经网站鉴权后由服务器转发，存储地址不暴露给用户
 *  - 本地开发：未配置 Blob 时写入 VDR_LOCAL_DIR（默认 .data/vdr）
 */
export const blobAccess = (process.env.VDR_BLOB_ACCESS === "public" ? "public" : "private") as "public" | "private";

/**
 * Blob 读写令牌：优先 BLOB_READ_WRITE_TOKEN；连接 Blob 时若设置了自定义前缀（如 VDR_READ_WRITE_TOKEN），
 * 则取任一以 _READ_WRITE_TOKEN 结尾、值为 vercel_blob_rw_ 开头的环境变量
 */
export function blobToken(): string | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  for (const [k, v] of Object.entries(process.env)) if (k.endsWith("_READ_WRITE_TOKEN") && v?.startsWith("vercel_blob_rw_")) return v;
  return undefined;
}

/**
 * 新版 Vercel Blob 连接（2026 起）不再注入读写令牌，而是注入 BLOB_STORE_ID + BLOB_WEBHOOK_PUBLIC_KEY，
 * 服务器通过 Vercel OIDC 身份访问存储。自定义前缀时取任一以 _STORE_ID 结尾、值为 store_ 开头的变量
 */
export function blobStoreId(): string | undefined {
  if (process.env.BLOB_STORE_ID) return process.env.BLOB_STORE_ID;
  for (const [k, v] of Object.entries(process.env)) if (k.endsWith("_STORE_ID") && v?.startsWith("store_")) return v;
  return undefined;
}

export function blobWebhookKey(): string | undefined {
  if (process.env.BLOB_WEBHOOK_PUBLIC_KEY) return process.env.BLOB_WEBHOOK_PUBLIC_KEY;
  for (const [k, v] of Object.entries(process.env)) if (k.endsWith("_WEBHOOK_PUBLIC_KEY") && v) return v;
  return undefined;
}

/** 认证方式：token = 读写令牌（旧版连接）；oidc = 存储 ID + Vercel OIDC（新版连接） */
export function blobAuth(): "token" | "oidc" | null {
  if (blobToken()) return "token";
  if (blobStoreId()) return "oidc";
  return null;
}

/** 传给 SDK 的凭据参数 */
export function blobCreds(): { token?: string; storeId?: string } {
  const token = blobToken();
  if (token) return { token };
  const storeId = blobStoreId();
  return storeId ? { storeId } : {};
}

/** Vercel 上函数文件系统只读，不能退回本地存储 */
export const onVercel = () => !!process.env.VERCEL;

/** blob = Vercel Blob；local = 本地开发目录；none = 部署在 Vercel 但未连接 Blob（无法上传） */
export function storageMode(): "blob" | "local" | "none" {
  if (blobAuth()) return "blob";
  return onVercel() ? "none" : "local";
}

export const STORAGE_MISSING =
  "尚未配置文件存储：请在 Vercel 项目 → Storage 中创建 Blob 存储（Access 选 Private）并 Connect 到本项目，然后 Redeploy。";
const LOCAL_DIR = () => path.resolve(process.cwd(), process.env.VDR_LOCAL_DIR || ".data/vdr");

export async function saveLocal(key: string, buf: Buffer) {
  const p = path.join(LOCAL_DIR(), key);
  if (!p.startsWith(LOCAL_DIR())) throw new Error("非法路径");
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, buf);
}

export async function readStored(storage: "blob" | "local", key: string): Promise<Buffer> {
  if (storage === "local") {
    const p = path.join(LOCAL_DIR(), key);
    if (!p.startsWith(LOCAL_DIR())) throw new Error("非法路径");
    return fs.readFile(p);
  }
  const r = await get(key, { access: blobAccess, useCache: false, ...blobCreds() });
  if (!r || r.statusCode !== 200 || !r.stream) throw new Error("文件在存储中不存在");
  const chunks: Uint8Array[] = [];
  const reader = r.stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function streamStored(storage: "blob" | "local", key: string): Promise<ReadableStream<Uint8Array> | Buffer> {
  if (storage === "local") return readStored(storage, key);
  const r = await get(key, { access: blobAccess, useCache: false, ...blobCreds() });
  if (!r || r.statusCode !== 200 || !r.stream) throw new Error("文件在存储中不存在");
  return r.stream;
}

export async function deleteStored(storage: "blob" | "local", key: string) {
  if (storage === "local") {
    await fs.rm(path.join(LOCAL_DIR(), key), { force: true });
    return;
  }
  await del(key, { ...blobCreds() });
}

export async function headStored(key: string) {
  return head(key, { ...blobCreds() });
}
