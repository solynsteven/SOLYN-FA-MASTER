import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { qaChats, qaMessages, users } from "@/db/schema";
import { callClaude } from "@/lib/anthropic";
import type { QaViewer } from "./access";
import { SUMMARY_SYSTEM } from "./ai";

/** 读取会话：本人或项目管理员可读 */
export async function loadChat(projectId: string, chatId: string, viewer: QaViewer) {
  if (!/^[0-9a-f-]{36}$/i.test(chatId)) return null;
  const [row] = await db
    .select({ chat: qaChats, owner: users.name })
    .from(qaChats)
    .leftJoin(users, eq(users.id, qaChats.userId))
    .where(and(eq(qaChats.id, chatId), eq(qaChats.projectId, projectId)));
  if (!row) return null;
  if (row.chat.userId !== viewer.userId && !viewer.isManager) return null;
  const messages = await db.select().from(qaMessages).where(eq(qaMessages.chatId, chatId)).orderBy(asc(qaMessages.createdAt));
  return { ...row, messages };
}

type Loaded = NonNullable<Awaited<ReturnType<typeof loadChat>>>;

export function transcript(c: Loaded) {
  return c.messages
    .filter((m) => m.content && !(m.role === "assistant" && m.error && !m.content))
    .map((m) => `${m.role === "user" ? "【提问】" : "【回答】"}\n${m.content}`)
    .join("\n\n");
}

/** 小结：对话有更新时重新生成 */
export async function ensureSummary(c: Loaded, force = false) {
  const last = c.messages[c.messages.length - 1]?.createdAt;
  if (!force && c.chat.summary && c.chat.summaryAt && (!last || c.chat.summaryAt >= last)) return c.chat.summary;
  if (!c.messages.some((m) => m.role === "assistant" && m.content)) throw new Error("对话中还没有 AI 回答，无法生成小结");
  const text = await callClaude({ system: SUMMARY_SYSTEM, messages: [{ role: "user", content: transcript(c) }], maxTokens: 1500 });
  const now = new Date();
  await db.update(qaChats).set({ summary: text, summaryAt: now }).where(eq(qaChats.id, c.chat.id));
  c.chat.summary = text;
  c.chat.summaryAt = now;
  return text;
}
