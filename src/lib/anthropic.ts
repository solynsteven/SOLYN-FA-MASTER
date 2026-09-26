import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { decrypt } from "./crypto";

const API = "https://api.anthropic.com/v1";
const VERSION = "2023-06-01";

export async function listModels(apiKey: string): Promise<string[]> {
  const r = await fetch(`${API}/models?limit=100`, {
    headers: { "x-api-key": apiKey, "anthropic-version": VERSION },
    cache: "no-store",
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Anthropic 返回 ${r.status}：${t.slice(0, 200)}`);
  }
  const j = (await r.json()) as { data: { id: string }[] };
  return j.data.map((m) => m.id);
}

/** 取当前默认启用的 Key（供 Agent / Skill 调用） */
export async function getActiveKey() {
  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.isActive, true), eq(apiKeys.provider, "anthropic")))
    .orderBy(desc(apiKeys.isDefault), desc(apiKeys.updatedAt))
    .limit(1);
  const k = rows[0];
  if (!k) return null;
  return { id: k.id, apiKey: decrypt(k.encryptedKey), model: k.model };
}

export type ClaudeMessage = { role: "user" | "assistant"; content: string };

/** 最小化的 Messages API 调用封装；导入 Skill 在字段映射不确定时会调用 */
export async function callClaude(opts: { system?: string; messages: ClaudeMessage[]; maxTokens?: number }) {
  const key = await getActiveKey();
  if (!key) throw new Error("尚未配置可用的 Agent API Key，请联系全局管理员");
  const r = await fetch(`${API}/messages`, {
    method: "POST",
    headers: { "x-api-key": key.apiKey, "anthropic-version": VERSION, "content-type": "application/json" },
    body: JSON.stringify({ model: key.model, max_tokens: opts.maxTokens ?? 4096, system: opts.system, messages: opts.messages }),
  });
  if (!r.ok) throw new Error(`Claude API 错误 ${r.status}：${(await r.text()).slice(0, 300)}`);
  const j = (await r.json()) as { content: { type: string; text?: string }[] };
  return j.content.filter((c) => c.type === "text").map((c) => c.text).join("");
}
