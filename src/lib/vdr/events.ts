import "server-only";
import { headers } from "next/headers";
import { db } from "@/db";
import { vdrEvents } from "@/db/schema";

export async function logVdr(projectId: string, userId: string | null, action: string, ref: { fileId?: string | null; folderId?: string | null; detail?: Record<string, unknown> } = {}) {
  let ip: string | null = null;
  let ua: string | null = null;
  try {
    const h = await headers();
    ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip");
    ua = h.get("user-agent");
  } catch {}
  await db.insert(vdrEvents).values({
    projectId, userId, action, fileId: ref.fileId ?? null, folderId: ref.folderId ?? null, detail: ref.detail ?? {}, ip, userAgent: ua?.slice(0, 300) ?? null,
  });
}
