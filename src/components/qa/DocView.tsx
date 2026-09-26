"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

type Sec = { ord: number; heading: string; depth: number; lines: [number, number]; html: string };

/** 知识库 .md 阅读：左侧目录，正文按段落锚点定位（AI 引用 [D文件.段落] 可直接跳转），高亮搜索关键字 */
export function DocView({ sections, focus, terms, docSeq }: { sections: Sec[]; focus: number | null; terms: string[]; docSeq: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (terms.length) {
      const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      for (const n of nodes) {
        const t = n.nodeValue ?? "";
        if (!re.test(t)) continue;
        re.lastIndex = 0;
        const frag = document.createDocumentFragment();
        let last = 0;
        t.replace(re, (m, _g, i: number) => {
          frag.append(t.slice(last, i));
          const mk = document.createElement("mark");
          mk.textContent = m;
          frag.append(mk);
          last = i + m.length;
          return m;
        });
        frag.append(t.slice(last));
        n.replaceWith(frag);
      }
    }
    if (focus) document.getElementById(`c${focus}`)?.scrollIntoView({ block: "start" });
  }, [focus, terms]);
  const toc = sections.filter((s) => s.heading);
  return (
    <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav className="card sticky top-4 hidden h-fit max-h-[calc(100vh-120px)] overflow-y-auto p-2 lg:block">
        <div className="eyebrow px-2 pb-2 pt-1">目录</div>
        {toc.map((s) => (
          <a key={s.ord} href={`#c${s.ord}`} className={cn("block truncate rounded px-2 py-1 text-xs hover:bg-ink-850 hover:text-brand-paper", s.ord === focus ? "bg-ink-700 text-brand-paper" : "text-brand-mist/75")} style={{ paddingLeft: 8 + Math.max(0, s.depth - 1) * 10 }}>
            {s.heading}
          </a>
        ))}
      </nav>
      <div ref={ref} className="card md-body px-7 py-6">
        {sections.map((s) => (
          <section key={s.ord} id={`c${s.ord}`} className={cn("group relative scroll-mt-4 rounded-md", s.ord === focus && "md-focus")}>
            <span className="absolute -left-5 top-1 hidden font-num text-[10px] text-brand-sage/60 group-hover:block" title={`引用标记 D${docSeq}.${s.ord} · 第 ${s.lines[0]}–${s.lines[1]} 行`}>
              {s.ord}
            </span>
            <div dangerouslySetInnerHTML={{ __html: s.html }} />
          </section>
        ))}
      </div>
    </div>
  );
}
