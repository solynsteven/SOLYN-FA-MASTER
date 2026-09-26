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
export function storageMode(): "blob" | "local" {
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local";
}
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
  const r = await get(key, { access: blobAccess, useCache: false });
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
  const r = await get(key, { access: blobAccess, useCache: false });
  if (!r || r.statusCode !== 200 || !r.stream) throw new Error("文件在存储中不存在");
  return r.stream;
}

export async function deleteStored(storage: "blob" | "local", key: string) {
  if (storage === "local") {
    await fs.rm(path.join(LOCAL_DIR(), key), { force: true });
    return;
  }
  await del(key);
}

export async function headStored(key: string) {
  return head(key);
}
