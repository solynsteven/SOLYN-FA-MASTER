import { NextResponse, type NextRequest } from "next/server";
import { getProjectAccess, audit } from "@/lib/auth";
import { qaViewer } from "@/lib/qa/access";
import { loadChat, ensureSummary } from "@/lib/qa/chats";
import { buildAiPdf } from "@/lib/export/ai-pdf";
import { fileStamp } from "@/lib/export/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** AI 问答导出：type=report 完整报告（含小结、每轮问答与出处）/ type=summary 小结（自动生成或更新） */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string; chatId: string }> }) {
  const { projectId, chatId } = await params;
  const access = await getProjectAccess(projectId);
  if (!access || !access.enabledModules.has("qa")) return new NextResponse("无权访问", { status: 403 });
  const viewer = await qaViewer(projectId);
  if (!viewer || viewer.rank === 0) return new NextResponse("无 Q&A 权限", { status: 403 });
  const c = await loadChat(projectId, chatId, viewer);
  if (!c) return new NextResponse("对话不存在", { status: 404 });
  const type = req.nextUrl.searchParams.get("type") === "summary" ? "summary" : "report";
  if (type === "summary") {
    try {
      await ensureSummary(c);
    } catch (e) {
      return new NextResponse(`生成小结失败：${e instanceof Error ? e.message : String(e)}`, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  }
  const buf = await buildAiPdf(access.project, { title: c.chat.title, owner: c.owner ?? "", group: c.chat.accessGroup, createdAt: c.chat.createdAt, summary: c.chat.summary, summaryAt: c.chat.summaryAt }, c.messages, { type, actor: access.user.name });
  await audit(viewer.userId, "qa.ai.export", { chatId, type }, projectId);
  const name = `${access.project.code}_AI问答${type === "summary" ? "小结" : "报告"}_${c.chat.title.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 30)}_${fileStamp()}.pdf`;
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}` },
  });
}
