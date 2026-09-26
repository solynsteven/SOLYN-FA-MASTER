import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { vdrFiles, vdrFolders, trackerItems } from "@/db/schema";
import { getProjectAccess } from "@/lib/auth";
import { saveLocal, storageMode } from "@/lib/vdr/storage";
import { logVdr } from "@/lib/vdr/events";

export const runtime = "nodejs";

/** 本地开发用：未配置 Vercel Blob 时，文件经服务器写入本地目录 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const a = await getProjectAccess(projectId);
  if (!a || !a.canManage || !a.enabledModules.has("vdr")) return NextResponse.json({ error: "仅项目管理员可上传文件" }, { status: 403 });
  if (storageMode() !== "local") return NextResponse.json({ error: "已启用 Vercel Blob，请使用直传" }, { status: 400 });
  const fd = await req.formData();
  const file = fd.get("file");
  const folderId = String(fd.get("folderId") ?? "");
  if (!(file instanceof File)) return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  const [folder] = await db.select().from(vdrFolders).where(and(eq(vdrFolders.id, folderId), eq(vdrFolders.projectId, projectId), isNull(vdrFolders.deletedAt)));
  if (!folder) return NextResponse.json({ error: "目录不存在" }, { status: 400 });
  const taskCode = String(fd.get("taskCode") ?? "").trim() || null;
  const ddCode = String(fd.get("ddCode") ?? "").trim() || null;
  for (const [mk, code, label] of [["fa", taskCode, "项目任务编码"], ["dd", ddCode, "材料编码"]] as const) {
    if (!code) continue;
    const rows = await db.select({ id: trackerItems.id }).from(trackerItems).where(and(eq(trackerItems.projectId, projectId), eq(trackerItems.moduleKey, mk), eq(trackerItems.externalKey, code), isNull(trackerItems.deletedAt))).limit(1);
    if (!rows.length) return NextResponse.json({ error: `${label}「${code}」不存在` }, { status: 400 });
  }
  const key = `vdr/${projectId}/${randomUUID()}`;
  await saveLocal(key, Buffer.from(await file.arrayBuffer()));
  const [f] = await db.insert(vdrFiles).values({
    projectId, folderId, name: file.name.replace(/[\\/:*?"<>|]/g, "_"), size: file.size, contentType: file.type || null, storage: "local", storageKey: key,
    taskCode, ddCode, description: String(fd.get("description") ?? "").trim() || null, uploadedBy: a.user.id,
  }).returning();
  await logVdr(projectId, a.user.id, "upload", { fileId: f.id, folderId, detail: { name: f.name, size: f.size } });
  return NextResponse.json({ id: f.id });
}
