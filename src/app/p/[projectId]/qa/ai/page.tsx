import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { qaChats, qaMessages, users } from "@/db/schema";
import { requireProject } from "@/lib/auth";
import { qaViewer } from "@/lib/qa/access";
import { loadKb } from "@/lib/qa/kb";
import { loadChat } from "@/lib/qa/chats";
import { getActiveKey } from "@/lib/anthropic";
import { seedDefaultFields } from "@/lib/project-service";
import { PageHeader } from "@/components/PageHeader";
import { QaTabs, QaNoAccess } from "@/components/qa/QaTabs";
import { AiClient } from "@/components/qa/AiClient";

export const metadata = { title: "AI 智能问答" };
export const maxDuration = 60;

export default async function AiPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ chat?: string; ask?: string; all?: string }> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { project } = await requireProject(projectId, { module: "qa" });
  const viewer = await qaViewer(projectId);
  if (!viewer || viewer.rank === 0) {
    return (
      <>
        <PageHeader eyebrow={`${project.code} · Q&A · AI Assistant`} title="AI 智能问答" />
        <QaNoAccess />
      </>
    );
  }
  await seedDefaultFields(projectId, "qa");
  const showAll = viewer.isManager && sp.all === "1";
  const counts = sql<number>`(select count(*)::int from ${qaMessages} where ${qaMessages.chatId} = ${qaChats.id} and ${qaMessages.role} = 'user')`;
  const chats = await db
    .select({ id: qaChats.id, title: qaChats.title, updatedAt: qaChats.updatedAt, userId: qaChats.userId, owner: users.name, group: qaChats.accessGroup, n: counts })
    .from(qaChats)
    .leftJoin(users, eq(users.id, qaChats.userId))
    .where(showAll ? eq(qaChats.projectId, projectId) : and(eq(qaChats.projectId, projectId), eq(qaChats.userId, viewer.userId)))
    .orderBy(desc(qaChats.updatedAt))
    .limit(200);
  const cur = sp.chat ? await loadChat(projectId, sp.chat, viewer) : null;
  const [kb, key] = await Promise.all([loadKb(projectId, viewer), getActiveKey()]);

  return (
    <>
      <PageHeader
        eyebrow={`${project.code} · Q&A · AI Assistant`}
        title="AI 智能问答"
        desc={`基于你有权阅读的 Q&A 记录与文件区资料实时分析作答，回答注明出处。${viewer.isManager ? "" : `你的权限组：${viewer.group}。`}`}
      />
      <QaTabs projectId={projectId} active="ai" />
      <AiClient
        key={cur?.chat.id ?? "new"}
        projectId={projectId}
        me={{ id: viewer.userId, isManager: viewer.isManager, group: viewer.group }}
        model={key?.model ?? null}
        scope={{ records: kb.items.length, docs: kb.docs.length, areas: kb.areas.length }}
        showAll={showAll}
        initialAsk={sp.ask ?? ""}
        chats={chats.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString(), owner: c.owner ?? "", mine: c.userId === viewer.userId, group: c.group, n: c.n }))}
        chat={
          cur
            ? {
                id: cur.chat.id, title: cur.chat.title, owner: cur.owner ?? "", mine: cur.chat.userId === viewer.userId, group: cur.chat.accessGroup,
                summary: cur.chat.summary, summaryAt: cur.chat.summaryAt?.toISOString() ?? null, createdAt: cur.chat.createdAt.toISOString(),
                messages: cur.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, citations: m.citations, error: m.error, model: m.model, at: m.createdAt.toISOString() })),
              }
            : null
        }
      />
    </>
  );
}
