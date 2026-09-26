import "server-only";
import type { Project, QaCitation, QaMessage } from "@/db/schema";
import { fmtDateTime } from "@/lib/format";
import { audienceText } from "@/lib/qa/groups";
import { citedRefs } from "@/lib/qa/ai";
import { createReport, PC, M, W, BOTTOM } from "./pdf-base";

type Chat = { title: string; owner: string; group: string | null; createdAt: Date; summary: string | null; summaryAt: Date | null };
type R = ReturnType<typeof createReport>;

/** Markdown（AI 回答 / 小结）→ PDF 段落：标题加粗、列表缩进、表格按行、去掉强调符号 */
function writeMd(r: R, src: string, size = 9) {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  let inCode = false;
  for (const raw of lines) {
    if (/^\s*```/.test(raw)) { inCode = !inCode; continue; }
    let ln = raw.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1（$2）");
    if (inCode) { r.para(ln, { size: size - 1, color: PC.sub, indent: 10, gap: 0 }); continue; }
    if (!ln.trim()) { r.y += 3; continue; }
    const h = ln.match(/^(#{1,6})\s+(.*)$/);
    if (h) { r.y += 3; r.para(h[2], { size: h[1].length <= 2 ? size + 1.5 : size + 0.5, bold: true, color: PC.pine, gap: 2 }); continue; }
    if (/^\s*\|?\s*:?-{3,}/.test(ln) && ln.includes("-") && /^[\s|:-]+$/.test(ln)) continue; // 表格分隔行
    if (/^\s*\|.*\|\s*$/.test(ln)) { r.para(ln.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()).join("　｜　"), { size: size - 0.5, indent: 6, gap: 1 }); continue; }
    const li = ln.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (li) {
      const depth = Math.min(3, Math.floor(li[1].length / 2));
      const bullet = /\d/.test(li[2]) ? li[2] : "•";
      r.para(`${bullet} ${li[3]}`, { size, indent: 8 + depth * 12, gap: 1 });
      continue;
    }
    const bq = ln.match(/^>\s?(.*)$/);
    if (bq) { r.para(bq[1], { size, color: PC.sub, indent: 10, gap: 1 }); continue; }
    ln = ln.trim();
    r.para(ln, { size, gap: 2 });
  }
  r.y += 4;
}

function citeTable(r: R, cites: QaCitation[]) {
  r.table(cites, [
    { h: "出处", w: 44, get: (c) => c.ref, color: () => PC.green },
    { h: "来源", w: 150, get: (c) => c.label },
    { h: "位置 / 说明", w: 120, get: (c) => c.detail },
    { h: "摘要", w: 0, get: (c) => c.snippet },
  ], "（本回答未引用资料）", 7.2);
}

export async function buildAiPdf(project: Project, chat: Chat, messages: QaMessage[], opts: { type: "report" | "summary"; actor: string }) {
  const isSummary = opts.type === "summary";
  const R = createReport({
    title: isSummary ? "AI 智能问答 · 小结" : "AI 智能问答报告",
    en: isSummary ? "Knowledge Base Q&A · Summary" : "Knowledge Base Q&A · Report",
    docTitle: `${project.name} ${isSummary ? "AI 问答小结" : "AI 问答报告"} ${chat.title}`,
  });
  const turns = messages.filter((m) => m.role === "user").length;
  R.cover(project, [project.code, `对话：${chat.title}`, `提问人 ${chat.owner}${chat.group ? `（${chat.group}）` : ""}`, `开始于 ${fmtDateTime(chat.createdAt)}`, `${turns} 个问题`, `导出人 ${opts.actor} · ${fmtDateTime(new Date())}`],
    `AI 回答仅依据提问人权限组${chat.group ? `（${chat.group}，可见 ${audienceText(chat.group)} 标注的资料）` : ""}可见的 Q&A 记录与文件区资料生成；出处标记 [Q12] 指 Q&A 记录 #12，[D3.5] 指文件 D3 的第 5 段。AI 回答可能有误，请以原始记录为准。`);

  const allCites = new Map<string, QaCitation>();
  for (const m of messages) for (const c of m.citations ?? []) if (!allCites.has(c.ref)) allCites.set(c.ref, c);

  if (chat.summary) {
    R.section("对话小结", chat.summaryAt ? `生成于 ${fmtDateTime(chat.summaryAt)}` : undefined);
    writeMd(R, chat.summary, 9);
  }

  if (isSummary) {
    R.section("提问清单");
    let n = 0;
    for (const m of messages) if (m.role === "user") R.para(`${++n}. ${m.content.replace(/\s+/g, " ")}`, { size: 8.5, indent: 4, gap: 2 });
    R.y += 10;
    const refs = chat.summary ? citedRefs(chat.summary) : [];
    const used = refs.map((r) => allCites.get(r)).filter((c): c is QaCitation => !!c);
    R.section("小结引用的来源", used.length ? `共 ${used.length} 项` : undefined);
    citeTable(R, used.length ? used : [...allCites.values()]);
    return R.finish(project.code);
  }

  let n = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "user") continue;
    n++;
    const a = messages[i + 1]?.role === "assistant" ? messages[i + 1] : null;
    R.section(`问题 ${n}`, fmtDateTime(m.createdAt));
    R.ensure(40);
    const qh = R.heightOf(m.content, W - 20, 9.5, true);
    if (R.y + qh + 12 < BOTTOM) R.doc.roundedRect(M, R.y - 2, W, qh + 12, 3).fill(PC.paper);
    R.y += 4;
    R.para(m.content, { size: 9.5, bold: true, color: PC.pine, indent: 10, width: W - 20, gap: 10 });
    if (!a) { R.para("（没有回答）", { color: PC.sage }); continue; }
    R.text("回答", M, R.y, { size: 8, color: PC.sage, characterSpacing: 1 });
    R.y += 14;
    if (a.content) writeMd(R, a.content, 9);
    if (a.error) R.para(`⚠ ${a.error}`, { size: 8, color: PC.alert });
    if (a.citations?.length) {
      R.ensure(50);
      R.text(`引用来源（${a.citations.length}）`, M, R.y, { size: 8, bold: true, color: PC.sub });
      R.y += 14;
      citeTable(R, a.citations);
    }
    R.rule();
  }
  return R.finish(project.code);
}
