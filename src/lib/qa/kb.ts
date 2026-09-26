import "server-only";
import { and, asc, eq, isNull, inArray } from "drizzle-orm";
import { db } from "@/db";
import { qaAreas, qaDocs, trackerItems, users } from "@/db/schema";
import { listFields } from "@/lib/queries";
import { sortByCode } from "@/lib/code-sort";
import { canSee, filterQa, type QaViewer } from "./access";
import { parseMd, queryTerms, scoreText, snippetOf, norm, mdPlain } from "./kb-core";

export type KbSource = {
  kind: "qa" | "doc";
  ref: string; // Q12 / D3.5
  id: string; // 记录 id / 文件 id
  anchor?: number; // 文件段落序号
  title: string; // 提问内容首行 / 文件名
  sub: string; // 阶段·状态 / 章节路径
  group: string; // 权限组
  area?: string;
  lines?: [number, number];
  text: string; // 发给 AI 的完整文本
  fields: { text: string; weight: number }[];
};

type Loaded = Awaited<ReturnType<typeof loadKb>>;

/** 按当前用户权限组加载可见的文件区、文件与 Q&A 记录 */
export async function loadKb(projectId: string, viewer: QaViewer, opts: { withContent?: boolean } = {}) {
  const areas0 = await db.select().from(qaAreas).where(eq(qaAreas.projectId, projectId)).orderBy(asc(qaAreas.sortOrder), asc(qaAreas.createdAt));
  const areas = areas0.filter((a) => canSee(viewer.rank, a.accessGroup));
  const areaIds = areas.map((a) => a.id);
  const docs = areaIds.length
    ? await db
        .select({
          id: qaDocs.id, areaId: qaDocs.areaId, seq: qaDocs.seq, name: qaDocs.name, title: qaDocs.title, size: qaDocs.size, version: qaDocs.version,
          uploadedBy: qaDocs.uploadedBy, createdAt: qaDocs.createdAt, updatedAt: qaDocs.updatedAt, uploader: users.name,
          ...(opts.withContent ? { content: qaDocs.content } : {}),
        })
        .from(qaDocs)
        .leftJoin(users, eq(users.id, qaDocs.uploadedBy))
        .where(and(eq(qaDocs.projectId, projectId), inArray(qaDocs.areaId, areaIds)))
        .orderBy(asc(qaDocs.seq))
    : [];
  const fields = await listFields(projectId, "qa");
  const items0 = await db
    .select({ id: trackerItems.id, data: trackerItems.data, updatedAt: trackerItems.updatedAt })
    .from(trackerItems)
    .where(and(eq(trackerItems.projectId, projectId), eq(trackerItems.moduleKey, "qa"), isNull(trackerItems.deletedAt)));
  const codeKey = fields.find((f) => f.role === "code")?.key ?? "code";
  const items = sortByCode(filterQa(items0, fields, viewer.rank), codeKey);
  const fa = await db
    .select({ k: trackerItems.externalKey, data: trackerItems.data })
    .from(trackerItems)
    .where(and(eq(trackerItems.projectId, projectId), eq(trackerItems.moduleKey, "fa"), isNull(trackerItems.deletedAt)));
  const faTitle = new Map(fa.filter((x) => x.k).map((x) => [x.k!, String(x.data.task ?? "").split("\n")[0]]));
  return { areas, docs: docs as (typeof docs[number] & { content?: string })[], fields, items, faTitle, codeKey };
}

const s = (v: unknown) => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join("、") : String(v));

/** 把可见数据整理为统一的「来源」列表（检索与 AI 引用共用） */
export function buildSources(k: Loaded): KbSource[] {
  const out: KbSource[] = [];
  for (const it of k.items) {
    const d = it.data;
    const code = s(d[k.codeKey]);
    const stage = s(d.stage);
    const lines = k.fields
      .filter((f) => d[f.key] !== null && d[f.key] !== undefined && d[f.key] !== "")
      .map((f) => `${f.label}：${s(d[f.key])}${f.key === "stage" && k.faTitle.get(stage) ? `（FA 任务：${k.faTitle.get(stage)}）` : ""}`);
    out.push({
      kind: "qa", ref: `Q${code}`, id: it.id,
      title: s(d.question).split("\n")[0] || `Q&A #${code}`,
      sub: [stage && `阶段 ${stage}`, s(d.respondent) && `提问对象 ${s(d.respondent)}`, s(d.status)].filter(Boolean).join(" · "),
      group: s(d.access_group) || "ADM",
      text: lines.join("\n"),
      fields: [
        { text: s(d.question), weight: 2 },
        { text: s(d.answer), weight: 1.6 },
        { text: [s(d.purpose), s(d.remark)].join("\n"), weight: 1 },
        { text: [stage, k.faTitle.get(stage) ?? "", s(d.asker), s(d.respondent), s(d.status), s(d.interview_ref), s(d.material_ref), `#${code}`].join(" "), weight: 1.2 },
      ],
    });
  }
  const areaById = new Map(k.areas.map((a) => [a.id, a]));
  for (const doc of k.docs) {
    if (!doc.content) continue;
    const area = areaById.get(doc.areaId);
    for (const c of parseMd(doc.content)) {
      if (!c.body) continue;
      const path = c.path.join(" › ");
      out.push({
        kind: "doc", ref: `D${doc.seq}.${c.ord}`, id: doc.id, anchor: c.ord,
        title: doc.name, sub: path || "（文件开头）", group: area?.accessGroup ?? "ADM", area: area?.name,
        lines: [c.lineStart, c.lineEnd],
        text: c.raw,
        fields: [{ text: path + " " + (doc.title ?? ""), weight: 2 }, { text: c.body, weight: 1 }, { text: doc.name, weight: 0.8 }],
      });
    }
  }
  return out;
}

export type KbHit = { src: KbSource; score: number; snippet: string };

/** 知识库检索：关键字 + 模糊匹配 */
export function searchSources(sources: KbSource[], q: string, scope: "all" | "qa" | "doc" = "all", limit = 60): KbHit[] {
  const terms = queryTerms(q);
  const phrase = norm(q.trim());
  const hits: KbHit[] = [];
  for (const src of sources) {
    if (scope !== "all" && src.kind !== scope) continue;
    const score = scoreText(terms, src.fields, phrase);
    if (score > 0) hits.push({ src, score, snippet: snippetOf(src.kind === "qa" ? src.fields.slice(0, 3).map((f) => f.text).join(" ｜ ") : mdPlain(src.fields[1].text), terms) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/* ------------------------------ AI 检索 ------------------------------ */

const Q_STOP = new Set(["什么", "怎么", "是否", "多少", "哪些", "如何", "有没", "没有", "为什", "么样", "一下", "请问", "告诉", "这个", "那个", "我们", "他们", "可以", "情况", "目前", "现在", "是不", "不是"]);

/** 自然语言问题 → 检索词：拉丁词 / 数字 + 中日文二元组 */
export function retrievalTerms(q: string) {
  const t = norm(q);
  const words = (t.match(/[a-z0-9][a-z0-9.\-_]{1,}/g) ?? []).filter((w) => w.length >= 2);
  const cjk = t.match(/[぀-ヿ㐀-鿿]+/g) ?? [];
  const grams: string[] = [];
  for (const run of cjk) {
    if (run.length === 1) continue;
    for (let i = 0; i < run.length - 1; i++) {
      const g = run.slice(i, i + 2);
      if (!Q_STOP.has(g)) grams.push(g);
    }
  }
  return [...new Set([...words, ...grams])];
}

/**
 * 为 AI 选取依据：
 *  - 可见数据总量不大时全部提供（回答最完整）
 *  - 否则按 BM25 风格（二元组 + idf）排序，在字数预算内取最相关的来源；Q&A 记录优先保底
 */
export function selectForAi(sources: KbSource[], question: string, budget = 90_000) {
  const total = sources.reduce((a, x) => a + x.text.length, 0);
  if (total <= budget) return { picked: sources, mode: "all" as const, total };
  const terms = retrievalTerms(question);
  const docsN = sources.length;
  const texts = sources.map((x) => norm(x.fields.map((f) => f.text).join("\n")));
  const df = new Map<string, number>();
  for (const term of terms) df.set(term, texts.filter((t) => t.includes(term)).length);
  const scored = sources.map((src, i) => {
    let sc = 0;
    for (const term of terms) {
      const n = df.get(term) ?? 0;
      if (!n) continue;
      const idf = Math.log(1 + (docsN - n + 0.5) / (n + 0.5));
      let occ = 0, j = texts[i].indexOf(term);
      while (j >= 0 && occ < 20) { occ++; j = texts[i].indexOf(term, j + term.length); }
      if (occ) sc += idf * ((occ * 2.2) / (occ + 1.2 * (0.25 + 0.75 * (texts[i].length / 800))));
    }
    return { src, sc };
  });
  scored.sort((a, b) => b.sc - a.sc);
  const picked: KbSource[] = [];
  let used = 0;
  for (const { src, sc } of scored) {
    if (sc <= 0 && picked.length >= 8) break;
    if (used + src.text.length > budget) continue;
    picked.push(src);
    used += src.text.length;
  }
  return { picked, mode: "retrieval" as const, total };
}
