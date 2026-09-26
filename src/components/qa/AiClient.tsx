"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles, Plus, Send, FileText, MessageSquareText, Download, ScrollText, Trash2, Users, User, Loader2, AlertTriangle, ExternalLink, RefreshCw, Square,
} from "lucide-react";
import { Alert, ConfirmButton, cn, useAction } from "@/components/ui";
import { renderAnswer } from "@/lib/qa/md";
import { fmtDateTime } from "@/lib/format";
import type { QaCitation } from "@/db/schema";
import { deleteChat, summarizeChat, getQaRecord } from "@/app/p/[projectId]/qa/ai/actions";
import { RecordDrawer, GroupBadge, type KbRecord } from "./KbClient";

type Msg = { id: string; role: "user" | "assistant"; content: string; citations: QaCitation[]; error: string | null; model?: string | null; at: string; live?: boolean };
type ChatV = { id: string; title: string; owner: string; mine: boolean; group: string | null; summary: string | null; summaryAt: string | null; createdAt: string; messages: Msg[] };
type ChatItem = { id: string; title: string; updatedAt: string; owner: string; mine: boolean; group: string | null; n: number };

const EXAMPLES = [
  "目前还有哪些关键问题尚未得到答复？按重要度列出。",
  "与 Uber 等平台依存相关的风险点和已知信息有哪些？",
  "关于行政处分与许可完整性，资料中有哪些发现？",
  "总结司机招聘、年龄结构与劳务合规方面的论点。",
];

export function AiClient(p: {
  projectId: string; me: { id: string; isManager: boolean; group: string | null }; model: string | null;
  scope: { records: number; docs: number; areas: number }; showAll: boolean; initialAsk: string; chats: ChatItem[]; chat: ChatV | null;
}) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>(p.chat?.messages ?? []);
  const [input, setInput] = useState(p.initialAsk);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(p.chat?.summary ?? null);
  const [record, setRecord] = useState<(KbRecord & { fields: { key: string; label: string; type: string; role: string | null }[] }) | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const sum = useAction();
  const del = useAction();
  const rec = useAction();
  const canAsk = !!p.model && (!p.chat || p.chat.mine);
  const base = `/p/${p.projectId}/qa/ai`;

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length, busy]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setErr(null);
    setInfo(null);
    setBusy(true);
    setInput("");
    const now = new Date().toISOString();
    setMsgs((m) => [...m, { id: `u${now}`, role: "user", content: q, citations: [], error: null, at: now }, { id: "live", role: "assistant", content: "", citations: [], error: null, at: now, live: true }]);
    const ctrl = new AbortController();
    abort.current = ctrl;
    let chatId = p.chat?.id ?? null;
    try {
      const r = await fetch(`${base}/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chatId, question: q }), signal: ctrl.signal });
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `请求失败（${r.status}）`);
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      const patch = (fn: (m: Msg) => Msg) => setMsgs((ms) => ms.map((m) => (m.id === "live" ? fn(m) : m)));
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.t === "chat") chatId = ev.id;
          else if (ev.t === "sources") setInfo(ev.mode === "all" ? `已提供你可见的全部 ${ev.total} 条资料` : `从 ${ev.total} 条可见资料中选取最相关的 ${ev.n} 条`);
          else if (ev.t === "d") patch((m) => ({ ...m, content: m.content + ev.v }));
          else if (ev.t === "done") patch((m) => ({ ...m, id: ev.messageId, citations: ev.citations, live: false }));
          else if (ev.t === "error") { patch((m) => ({ ...m, error: ev.error, live: false })); setErr(ev.error); }
        }
      }
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      setMsgs((ms) => ms.map((m) => (m.id === "live" ? { ...m, live: false, error: aborted ? "已停止生成" : String((e as Error).message) } : m)));
      if (!aborted) setErr((e as Error).message);
    } finally {
      setBusy(false);
      abort.current = null;
      if (chatId) {
        if (!p.chat) router.replace(`${base}?chat=${chatId}`);
        else router.refresh();
      }
    }
  }

  const openCite = (c: QaCitation) => {
    if (c.kind === "doc" && c.docId) window.open(`/p/${p.projectId}/qa/kb/doc/${c.docId}?c=${c.anchor ?? ""}`, "_blank");
    else if (c.kind === "qa" && c.itemId) rec.exec(() => getQaRecord(p.projectId, c.itemId!), (r) => r.data && setRecord(r.data));
  };

  const onAnswerClick = (e: React.MouseEvent, m: Msg) => {
    const t = (e.target as HTMLElement).closest("button.cite") as HTMLElement | null;
    if (!t) return;
    const ref = t.dataset.ref!;
    const c = m.citations.find((x) => x.ref === ref);
    setFlash(`${m.id}:${ref}`);
    setTimeout(() => setFlash(null), 1600);
    if (c) openCite(c);
    else document.getElementById(`cite-${m.id}-${ref}`)?.scrollIntoView({ block: "nearest" });
  };

  const allCites = useMemo(() => {
    const m = new Map<string, QaCitation>();
    for (const x of msgs) for (const c of x.citations) if (!m.has(c.ref)) m.set(c.ref, c);
    return m;
  }, [msgs]);
  const onSummaryClick = (e: React.MouseEvent) => {
    const t = (e.target as HTMLElement).closest("button.cite") as HTMLElement | null;
    const c = t && allCites.get(t.dataset.ref!);
    if (c) openCite(c);
  };

  const scopeText = `依据：Q&A 记录 ${p.scope.records} 条 · 文件区 ${p.scope.areas} 个 / 文件 ${p.scope.docs} 个`;

  return (
    <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
      {/* 会话列表 */}
      <aside className="card h-fit p-2">
        <Link href={base} className="btn-primary mb-2 w-full justify-center"><Plus size={14} />新对话</Link>
        {p.me.isManager && (
          <div className="mb-2 grid grid-cols-2 gap-1 rounded-md bg-ink-850 p-0.5 text-2xs">
            <Link href={base} className={cn("flex items-center justify-center gap-1 rounded py-1", !p.showAll ? "bg-ink-700 text-brand-paper" : "text-brand-sage")}><User size={12} />我的</Link>
            <Link href={`${base}?all=1`} className={cn("flex items-center justify-center gap-1 rounded py-1", p.showAll ? "bg-ink-700 text-brand-paper" : "text-brand-sage")}><Users size={12} />全部用户</Link>
          </div>
        )}
        <div className="max-h-[calc(100vh-320px)] space-y-0.5 overflow-y-auto">
          {p.chats.map((c) => (
            <Link
              key={c.id}
              href={`${base}?chat=${c.id}${p.showAll ? "&all=1" : ""}`}
              className={cn("block rounded-md px-2.5 py-2 transition", p.chat?.id === c.id ? "bg-ink-700" : "hover:bg-ink-850")}
            >
              <div className="truncate text-[13px] text-brand-paper">{c.title}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-brand-sage">
                <span className="font-num">{fmtDateTime(c.updatedAt)}</span>
                <span>· {c.n} 问</span>
                {!c.mine && <span className="truncate">· {c.owner}{c.group ? `（${c.group}）` : ""}</span>}
              </div>
            </Link>
          ))}
          {p.chats.length === 0 && <div className="px-2.5 py-4 text-2xs text-brand-sage">还没有对话记录。</div>}
        </div>
      </aside>

      <div className="card flex min-h-[calc(100vh-260px)] min-w-0 flex-col">
        {/* 头部 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-brand-paper">{p.chat?.title ?? "新对话"}</div>
            <div className="text-2xs text-brand-sage">
              {p.chat && !p.chat.mine ? `${p.chat.owner} 的对话（${p.chat.group ?? "—"}）· 只读 · ` : ""}
              {scopeText}{p.model ? ` · 模型 ${p.model}` : ""}
            </div>
          </div>
          {p.chat && (
            <>
              <button className="btn-secondary btn-sm" disabled={sum.pending || busy} onClick={() => sum.exec(() => summarizeChat(p.projectId, p.chat!.id, !!summary), (r) => r.data && setSummary(r.data.summary))}>
                {sum.pending ? <Loader2 size={13} className="animate-spin" /> : summary ? <RefreshCw size={13} /> : <ScrollText size={13} />}{summary ? "更新小结" : "生成小结"}
              </button>
              <a className="btn-secondary btn-sm" href={`${base}/${p.chat.id}/export?type=summary`}><Download size={13} />小结 PDF</a>
              <a className="btn-secondary btn-sm" href={`${base}/${p.chat.id}/export?type=report`}><FileText size={13} />完整报告 PDF</a>
              {(p.chat.mine || p.me.isManager) && (
                <ConfirmButton className="btn-ghost btn-sm text-danger" title="删除对话" confirmText="删除" body="确定删除这段对话？删除后不可恢复。" onConfirm={() => del.exec(() => deleteChat(p.projectId, p.chat!.id), () => router.push(base))}>
                  <Trash2 size={13} />
                </ConfirmButton>
              )}
            </>
          )}
        </div>
        <Alert>{sum.error || del.error || rec.error}</Alert>
        {!p.model && <div className="m-4"><Alert kind="info">尚未配置 Agent API Key，暂不能使用 AI 问答。请联系全局管理员在「全局管理后台 → API Key」中添加并设为默认。</Alert></div>}

        {/* 消息 */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {summary && (
            <div className="rounded-md border border-brand-mid/40 bg-brand-green/10 px-4 py-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-brand-mist"><ScrollText size={13} />对话小结</div>
              <div className="md-body md-answer text-[13px]" onClick={onSummaryClick} dangerouslySetInnerHTML={{ __html: renderAnswer(summary, new Set(allCites.keys())) }} />
            </div>
          )}
          {msgs.length === 0 && (
            <div className="mx-auto max-w-xl py-10 text-center">
              <Sparkles size={28} strokeWidth={1.3} className="mx-auto mb-3 text-brand-sage" />
              <div className="text-sm font-medium text-brand-paper">向项目知识库提问</div>
              <div className="mt-1.5 text-xs leading-relaxed text-brand-sage">
                AI 只使用你的权限组{p.me.group ? `（${p.me.group}）` : ""}可见的 Q&A 记录与文件区资料作答，每个结论都会标注出处，例如 <span className="cite-demo">Q12</span> 表示 Q&A 记录 #12，<span className="cite-demo">D3.5</span> 表示文件 D3 的第 5 段。
              </div>
              {canAsk && (
                <div className="mt-5 grid gap-2 text-left sm:grid-cols-2">
                  {EXAMPLES.map((e) => (
                    <button key={e} className="rounded-md border border-line px-3 py-2 text-xs text-brand-mist hover:border-line-strong hover:bg-ink-850" onClick={() => ask(e)}>{e}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          {msgs.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-ink-700 px-3.5 py-2 text-[13px] text-brand-paper">{m.content}</div>
              </div>
            ) : (
              <div key={m.id} className="flex gap-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-brand-green"><Sparkles size={13} className="text-brand-paper" /></div>
                <div className="min-w-0 flex-1">
                  {m.content ? (
                    <div className="md-body md-answer text-[13.5px]" onClick={(e) => onAnswerClick(e, m)} dangerouslySetInnerHTML={{ __html: renderAnswer(m.content, m.live ? undefined : new Set(m.citations.map((c) => c.ref))) }} />
                  ) : m.live ? (
                    <div className="flex items-center gap-2 text-xs text-brand-sage"><Loader2 size={13} className="animate-spin" />{info ?? "正在检索资料…"}</div>
                  ) : null}
                  {m.live && m.content && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-brand-sage align-middle" />}
                  {m.error && <div className="mt-2 flex items-center gap-1.5 text-xs text-danger"><AlertTriangle size={12} />{m.error}</div>}
                  {m.citations.length > 0 && (
                    <div className="mt-3 rounded-md border border-line bg-ink-850/50">
                      <div className="border-b border-line px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-brand-sage">引用来源 · {m.citations.length}</div>
                      <ul className="divide-y divide-line">
                        {m.citations.map((c) => (
                          <li key={c.ref} id={`cite-${m.id}-${c.ref}`}>
                            <button className={cn("flex w-full items-start gap-2.5 px-3 py-2 text-left transition hover:bg-ink-800", flash === `${m.id}:${c.ref}` && "bg-brand-green/20")} onClick={() => openCite(c)}>
                              <span className="cite mt-0.5 shrink-0">{c.ref}</span>
                              {c.kind === "qa" ? <MessageSquareText size={13} className="mt-1 shrink-0 text-brand-sage" /> : <FileText size={13} className="mt-1 shrink-0 text-brand-sage" />}
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs text-brand-paper">{c.label}</span>
                                <span className="block truncate text-[11px] text-brand-sage">{c.detail}</span>
                                <span className="block truncate text-[11px] text-brand-mist/60">{c.snippet}</span>
                              </span>
                              {c.kind === "doc" && <ExternalLink size={12} className="mt-1 shrink-0 text-brand-sage" />}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!m.live && m.model && <div className="mt-1.5 text-[10px] text-brand-sage/70">{fmtDateTime(m.at)} · {m.model}</div>}
                </div>
              </div>
            ),
          )}
          <div ref={end} />
        </div>

        {/* 输入 */}
        {canAsk ? (
          <form className="border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
            {err && <div className="mb-2"><Alert>{err}</Alert></div>}
            <div className="flex items-end gap-2">
              <textarea
                className="input min-h-[44px] flex-1 resize-none py-2.5"
                rows={Math.min(6, Math.max(1, input.split("\n").length))}
                placeholder="输入问题，Enter 发送，Shift + Enter 换行"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(input); } }}
                disabled={busy}
              />
              {busy ? (
                <button type="button" className="btn-secondary h-[44px]" onClick={() => abort.current?.abort()}><Square size={13} />停止</button>
              ) : (
                <button className="btn-primary h-[44px]" disabled={!input.trim()}><Send size={14} />发送</button>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-brand-sage">
              {p.me.group && <><GroupBadge g={p.me.group} /><span>AI 仅使用该权限组可见的资料</span></>}
              <span className="ml-auto">AI 回答可能有误，请以引用的原始记录为准</span>
            </div>
          </form>
        ) : p.chat && !p.chat.mine ? (
          <div className="border-t border-line px-4 py-3 text-2xs text-brand-sage">这是 {p.chat.owner} 的对话，管理员只能查看与导出，不能在其中继续提问。</div>
        ) : null}
      </div>

      <RecordDrawer record={record} onClose={() => setRecord(null)} fields={record?.fields ?? []} terms={[]} faTitles={{}} docs={[]} projectId={p.projectId} />
    </div>
  );
}
