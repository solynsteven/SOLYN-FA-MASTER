/**
 * 项目知识库：.md 切分 + 关键字 / 模糊匹配检索（纯函数，服务端与浏览器共用）
 */

export type MdChunk = {
  ord: number; // 段落序号（从 1 开始）：引用标记 [D文件序号.段落序号]
  path: string[]; // 标题路径
  heading: string; // 本段标题（可能为空）
  raw: string; // 原文（含标题行）——按顺序拼接即为完整文件
  body: string; // 去掉标题行后的正文（检索用）
  lineStart: number;
  lineEnd: number;
};

const MAX_CHUNK = 1600;

function cleanHeading(s: string) {
  return s.replace(/^#{1,6}\s+/, "").replace(/\*\*|__|`/g, "").replace(/\s+#+\s*$/, "").trim();
}

/** 按标题切分；过长的段落在空行处再切分。所有段落按顺序覆盖整份文件 */
export function parseMd(content: string): MdChunk[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  type Sec = { path: string[]; heading: string; start: number; lines: string[] };
  const secs: Sec[] = [];
  const stack: { level: number; text: string }[] = [];
  let cur: Sec = { path: [], heading: "", start: 1, lines: [] };
  let fence = false;
  lines.forEach((ln, i) => {
    if (/^\s*(```|~~~)/.test(ln)) fence = !fence;
    const m = !fence && ln.match(/^(#{1,6})\s+(.+)$/);
    if (m) {
      if (cur.lines.length) secs.push(cur);
      const level = m[1].length;
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      const text = cleanHeading(ln);
      stack.push({ level, text });
      cur = { path: stack.map((s) => s.text), heading: text, start: i + 1, lines: [ln] };
    } else cur.lines.push(ln);
  });
  if (cur.lines.length) secs.push(cur);

  const out: MdChunk[] = [];
  for (const s of secs) {
    // 过长段落在空行处切分（表格、列表不会被截断）
    const parts: { start: number; lines: string[] }[] = [];
    let buf: string[] = [];
    let bufStart = s.start;
    let size = 0;
    s.lines.forEach((ln, j) => {
      if (size > MAX_CHUNK && ln.trim() === "" && buf.length) {
        parts.push({ start: bufStart, lines: buf });
        buf = [];
        size = 0;
        bufStart = s.start + j;
      }
      buf.push(ln);
      size += ln.length + 1;
    });
    if (buf.length) parts.push({ start: bufStart, lines: buf });
    parts.forEach((p, k) => {
      const raw = p.lines.join("\n");
      const body = (k === 0 && s.heading ? p.lines.slice(1) : p.lines).join("\n").trim();
      out.push({
        ord: out.length + 1,
        path: s.path,
        heading: s.heading + (parts.length > 1 ? `（${k + 1}/${parts.length}）` : ""),
        raw,
        body,
        lineStart: p.start,
        lineEnd: p.start + p.lines.length - 1,
      });
    });
  }
  return out;
}

export function mdTitle(content: string, fallback: string) {
  const m = content.match(/^#\s+(.+)$/m);
  return m ? cleanHeading(m[0]) : fallback.replace(/\.(md|markdown)$/i, "");
}

/* ------------------------------ 检索 ------------------------------ */

export const norm = (s: string) => s.normalize("NFKC").toLowerCase();

const STOP = new Set(["的", "了", "是", "吗", "呢", "和", "与", "及", "在", "有", "请", "问", "the", "a", "of", "and", "is", "what", "how"]);

/** 查询拆词：空白 / 标点分隔；中文长句额外按 2–4 字切片用于模糊匹配 */
export function queryTerms(q: string) {
  const parts = norm(q)
    .split(/[\s,，。、；;：:！!？?（）()【】\[\]「」『』“”"'‘’《》<>/|]+/)
    .map((s) => s.trim())
    .filter((s) => s && !STOP.has(s));
  return [...new Set(parts)].slice(0, 12);
}

function bigrams(s: string) {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

function countOcc(hay: string, needle: string) {
  if (!needle) return 0;
  let n = 0, i = hay.indexOf(needle);
  while (i >= 0 && n < 50) { n++; i = hay.indexOf(needle, i + needle.length); }
  return n;
}

/**
 * 打分：精确命中（按出现次数对数加权，标题 ×2）+ 模糊命中（中文按二元组覆盖率）+ 全部关键词命中加成
 * 返回 0 表示不相关
 */
export function scoreText(terms: string[], fields: { text: string; weight: number }[], phrase?: string) {
  if (!terms.length) return 0;
  const texts = fields.map((f) => ({ t: norm(f.text), w: f.weight }));
  let score = 0;
  let matched = 0;
  for (const term of terms) {
    let best = 0;
    for (const { t, w } of texts) {
      const n = countOcc(t, term);
      if (n) { best = Math.max(best, w * (1 + Math.log2(n)) * Math.min(3, 0.6 + term.length / 3)); continue; }
      // 模糊：二元组覆盖率 ≥ 60%（适合中文长词、日文与轻微错字）
      if (term.length >= 3) {
        const bg = bigrams(term);
        const hit = bg.filter((b) => t.includes(b)).length / bg.length;
        if (hit >= 0.6) best = Math.max(best, w * hit * 0.8);
      }
    }
    if (best > 0) matched++;
    score += best;
  }
  if (!matched) return 0;
  if (terms.length > 1 && matched === terms.length) score *= 1.5;
  if (phrase && phrase.length >= 2 && texts.some(({ t }) => t.includes(phrase))) score += 2;
  return Math.round(score * 100) / 100;
}

/** Markdown → 纯文本（用于摘要显示） */
export function mdPlain(s: string) {
  return s
    .split("\n")
    .filter((l) => !/^\s*\|?\s*:?-{3,}[-|:\s]*$/.test(l))
    .map((l) =>
      l
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^\s*>\s?/, "")
        .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, "")
        .replace(/^\s*\|(.*)\|\s*$/, (_m, inner: string) => inner.split("|").map((c) => c.trim()).filter(Boolean).join(" · "))
        .replace(/\*\*|__|`/g, "")
        .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1"),
    )
    .join("\n");
}

/** 摘要：围绕第一个命中位置截取 */
export function snippetOf(text: string, terms: string[], len = 140) {
  const flat = text.replace(/\s+/g, " ").trim();
  const t = norm(flat);
  let pos = -1;
  for (const term of terms) {
    const i = t.indexOf(term);
    if (i >= 0 && (pos < 0 || i < pos)) pos = i;
  }
  if (pos < 0) {
    for (const term of terms) for (const b of bigrams(term)) { const i = t.indexOf(b); if (i >= 0 && (pos < 0 || i < pos)) pos = i; }
  }
  if (pos < 0) return flat.slice(0, len) + (flat.length > len ? "…" : "");
  const start = Math.max(0, pos - Math.floor(len / 3));
  return (start > 0 ? "…" : "") + flat.slice(start, start + len) + (start + len < flat.length ? "…" : "");
}

/** 把文本按关键词切成高亮片段（前端渲染 <mark>） */
export function highlightParts(text: string, terms: string[]): { s: string; hit: boolean }[] {
  const ts = terms.filter((x) => x.length >= 1).sort((a, b) => b.length - a.length);
  if (!ts.length) return [{ s: text, hit: false }];
  const lower = norm(text);
  // NFKC 可能改变长度：长度不一致时退回不区分全半角的简单匹配
  const src = lower.length === text.length ? lower : text.toLowerCase();
  const out: { s: string; hit: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    let found = "";
    for (const t of ts) if (src.startsWith(t, i)) { found = t; break; }
    if (found) { out.push({ s: text.slice(i, i + found.length), hit: true }); i += found.length; }
    else {
      const last = out[out.length - 1];
      if (last && !last.hit) last.s += text[i];
      else out.push({ s: text[i], hit: false });
      i++;
    }
  }
  return out;
}
