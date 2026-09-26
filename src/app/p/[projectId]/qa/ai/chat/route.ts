import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { qaChats, qaMessages, type QaCitation } from "@/db/schema";
import { getProjectAccess, audit } from "@/lib/auth";
import { qaViewer } from "@/lib/qa/access";
import { loadKb, buildSources, selectForAi } from "@/lib/qa/kb";
import { systemPrompt, sourcesBlock, citedRefs, toCitation } from "@/lib/qa/ai";
import { streamClaude, getActiveKey, type ClaudeMessage } from "@/lib/anthropic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * AI 智能问答（流式）：按用户权限组取可见的 Q&A 记录与文件段落作为依据，调用后台设定的大模型回答并标注出处。
 * 返回 NDJSON：{t:"chat",id} → {t:"sources",n,mode} → {t:"d",v}… → {t:"done",messageId,citations} | {t:"error",error}
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const access = await getProjectAccess(projectId);
  if (!access || !access.enabledModules.has("qa")) return NextResponse.json({ error: "无权访问" }, { status: 403 });
  const viewer = await qaViewer(projectId);
  if (!viewer || viewer.rank === 0) return NextResponse.json({ error: "你没有 Q&A 模块的访问权限" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { chatId?: string; question?: string };
  const question = String(body.question ?? "").trim().slice(0, 4000);
  if (!question) return NextResponse.json({ error: "请输入问题" }, { status: 400 });
  if (!(await getActiveKey())) return NextResponse.json({ error: "尚未配置可用的 Agent API Key，请联系全局管理员在「全局管理后台 → API Key」中设置" }, { status: 400 });

  let chatId = body.chatId && /^[0-9a-f-]{36}$/i.test(body.chatId) ? body.chatId : null;
  if (chatId) {
    const [c] = await db.select().from(qaChats).where(and(eq(qaChats.id, chatId), eq(qaChats.projectId, projectId)));
    if (!c || c.userId !== viewer.userId) return NextResponse.json({ error: "只能在自己的对话中继续提问" }, { status: 403 });
  } else {
    const [c] = await db
      .insert(qaChats)
      .values({ projectId, userId: viewer.userId, title: question.replace(/\s+/g, " ").slice(0, 40), accessGroup: viewer.group })
      .returning();
    chatId = c.id;
  }
  const history = await db.select().from(qaMessages).where(eq(qaMessages.chatId, chatId)).orderBy(asc(qaMessages.createdAt));
  await db.insert(qaMessages).values({ chatId, role: "user", content: question });

  const kb = await loadKb(projectId, viewer, { withContent: true });
  const sources = buildSources(kb);
  const prevQ = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  const sel = selectForAi(sources, `${question}\n${prevQ}`);
  const byRef = new Map(sources.map((s) => [s.ref, s]));

  // 之前的对话（最近 6 条）作为上下文；资料只附在本次提问中
  const prior: ClaudeMessage[] = history.filter((m) => !m.error && m.content).slice(-6).map((m) => ({ role: m.role, content: m.content }));
  while (prior.length && prior[0].role !== "user") prior.shift();
  const messages: ClaudeMessage[] = [
    ...prior,
    { role: "user", content: `${sources.length ? sourcesBlock(sel.picked) : "<sources>\n（当前没有可见的资料）\n</sources>"}\n\n问题：${question}` },
  ];
  const system = systemPrompt({ project: access.project.name, group: viewer.group, isManager: viewer.isManager, mode: sel.mode, total: sources.length, picked: sel.picked.length });

  const enc = new TextEncoder();
  const cid = chatId;
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (o: unknown) => { try { ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch { /* 客户端已断开 */ } };
      send({ t: "chat", id: cid });
      send({ t: "sources", n: sel.picked.length, total: sources.length, mode: sel.mode });
      let text = "";
      try {
        let meta: { model: string; usage: Record<string, unknown>; stopReason: string | null } | null = null;
        for await (const ev of streamClaude({ system, messages, maxTokens: 3000, signal: req.signal })) {
          if (ev.type === "text") { text += ev.text; send({ t: "d", v: ev.text }); }
          else meta = ev;
        }
        if (meta?.stopReason === "max_tokens") text += "\n\n（回答已达长度上限，如需更多细节请继续追问。）";
        const citations: QaCitation[] = citedRefs(text).map((r) => byRef.get(r)).filter(Boolean).map((s) => toCitation(s!));
        const [m] = await db
          .insert(qaMessages)
          .values({ chatId: cid, role: "assistant", content: text, citations, model: meta?.model ?? null, usage: { ...(meta?.usage ?? {}), sources: sel.picked.length, mode: sel.mode } })
          .returning();
        await db.update(qaChats).set({ updatedAt: new Date() }).where(eq(qaChats.id, cid));
        await audit(viewer.userId, "qa.ai.ask", { chatId: cid, chars: question.length, sources: sel.picked.length }, projectId);
        send({ t: "done", messageId: m.id, citations });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await db.insert(qaMessages).values({ chatId: cid, role: "assistant", content: text, error: msg.slice(0, 500) });
        await db.update(qaChats).set({ updatedAt: new Date() }).where(eq(qaChats.id, cid));
        send({ t: "error", error: msg.slice(0, 300) });
      } finally {
        try { ctrl.close(); } catch { /* 已关闭 */ }
      }
    },
  });
  return new NextResponse(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
