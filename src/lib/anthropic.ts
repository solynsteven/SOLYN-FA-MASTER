import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { decrypt } from "./crypto";

const API = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1";
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

/** 流式调用：逐段产出文本；结束时返回用量 */
export async function* streamClaude(opts: { system?: string; messages: ClaudeMessage[]; maxTokens?: number; signal?: AbortSignal }): AsyncGenerator<
  { type: "text"; text: string } | { type: "done"; model: string; usage: Record<string, unknown>; stopReason: string | null }
> {
  const key = await getActiveKey();
  if (!key) throw new Error("尚未配置可用的 Agent API Key，请联系全局管理员");
  const r = await fetch(`${API}/messages`, {
    method: "POST",
    headers: { "x-api-key": key.apiKey, "anthropic-version": VERSION, "content-type": "application/json" },
    body: JSON.stringify({ model: key.model, max_tokens: opts.maxTokens ?? 4096, system: opts.system, messages: opts.messages, stream: true }),
    signal: opts.signal,
  });
  if (!r.ok || !r.body) throw new Error(`Claude API 错误 ${r.status}：${(await r.text()).slice(0, 300)}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const usage: Record<string, unknown> = {};
  let stopReason: string | null = null;
  let model = key.model;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
      if (!data) continue;
      let ev: { type: string; delta?: { type?: string; text?: string; stop_reason?: string }; message?: { model?: string; usage?: Record<string, unknown> }; usage?: Record<string, unknown>; error?: { message?: string } };
      try { ev = JSON.parse(data); } catch { continue; }
      if (ev.type === "message_start") { model = ev.message?.model ?? model; Object.assign(usage, ev.message?.usage ?? {}); }
      else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) yield { type: "text", text: ev.delta.text };
      else if (ev.type === "message_delta") { stopReason = ev.delta?.stop_reason ?? stopReason; Object.assign(usage, ev.usage ?? {}); }
      else if (ev.type === "error") throw new Error(`Claude API 错误：${ev.error?.message ?? "未知错误"}`);
    }
  }
  yield { type: "done", model, usage, stopReason };
}
