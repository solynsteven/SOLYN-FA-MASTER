import { Marked, type Tokens } from "marked";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Markdown → HTML（服务端与浏览器共用）：原始 HTML 一律转义，链接仅允许 http(s)/mailto，图片只显示替代文字 */
const md = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html(t: Tokens.HTML | Tokens.Tag) {
      return esc(t.text);
    },
    link(this: { parser: { parseInline: (t: Tokens.Generic[]) => string } }, t: Tokens.Link) {
      const inner = this.parser.parseInline(t.tokens);
      if (!/^(https?:|mailto:)/i.test(t.href)) return inner;
      return `<a href="${esc(t.href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
    },
    image(t: Tokens.Image) {
      return `<span class="md-img">[图片：${esc(t.text || t.href)}]</span>`;
    },
  },
});

export function renderMd(src: string) {
  return md.parse(src, { async: false }) as string;
}

const CITE = /\[((?:Q[A-Za-z0-9_\-]{1,20}|D\d+\.\d+)(?:\s*[,，、;；]\s*(?:Q[A-Za-z0-9_\-]{1,20}|D\d+\.\d+))*)\]/g;

/** AI 回答：Markdown + 出处标记 [Q12] / [D3.5] 渲染为可点击的引用标签 */
export function renderAnswer(src: string, known?: Set<string>) {
  const html = renderMd(src.replace(CITE, (_m, g: string) => g.split(/\s*[,，、;；]\s*/).map((r) => `⟦${r}⟧`).join("")));
  return html.replace(/⟦([A-Za-z0-9_.\-]{2,24})⟧/g, (_m, r: string) =>
    `<button type="button" class="cite${known && !known.has(r) ? " cite-x" : ""}" data-ref="${r}">${r}</button>`,
  );
}
