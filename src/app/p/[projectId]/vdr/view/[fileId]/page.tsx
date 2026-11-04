import { NextResponse } from "next/server";
import { requireProject } from "@/lib/auth";
import { fileAccess } from "@/lib/vdr/file-access";
import { levelOf } from "@/lib/vdr/caps";
import { db } from "@/db";
import { vdrFiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ViewerWindow } from "./ViewerWindow";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ projectId: string; fileId: string }> }) {
  const { fileId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return { title: "文件预览" };
  const [f] = await db.select({ name: vdrFiles.name }).from(vdrFiles).where(eq(vdrFiles.id, fileId));
  return { title: f?.name ?? "文件预览" };
}

/** 在线预览（独立浏览器标签页）：权限检查与 VDR 列表一致，未通过时显示原因 */
export default async function VdrViewPage({ params, searchParams }: { params: Promise<{ projectId: string; fileId: string }>; searchParams: Promise<{ dl?: string }> }) {
  const { projectId, fileId } = await params;
  const { dl } = await searchParams;
  await requireProject(projectId, { module: "vdr" });
  const r = /^[0-9a-f-]{36}$/i.test(fileId) ? await fileAccess(projectId, fileId, "preview") : new NextResponse("文件不存在", { status: 404 });
  if (r instanceof NextResponse) {
    return <ViewerWindow projectId={projectId} error={await r.text()} />;
  }
  const lv = r.ctx.isManager ? "L7" : levelOf(r.caps);
  return <ViewerWindow projectId={projectId} file={{ id: r.file.id, name: r.file.name, lv }} folderId={r.file.folderId} autoDownload={dl === "1"} />;
}
