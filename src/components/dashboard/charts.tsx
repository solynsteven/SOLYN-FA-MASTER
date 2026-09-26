"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { StatusKind } from "@/lib/status";
import type { Seg, ShareItem, StackRow, ListItem } from "@/lib/dashboard";
import { cn } from "@/lib/cn";

/**
 * 状态色：同一绿色色相的有序阶梯（已校验：单色相、明度单调、相邻差 ≥ 0.06、浅端对深色底 ≥ 2:1）
 * 暂缓用保留的警示色；中止/不适用、未填写用斜纹质感，不靠颜色区分
 */
export const KIND_COLOR: Record<StatusKind, string> = {
  done: "#A6E0C1",
  partial: "#6FB691",
  progress: "#478A69",
  todo: "#4F6B5D",
  hold: "#C9A865",
  excluded: "#2F423A",
  empty: "#26352F",
};
export function segStyle(kind: StatusKind): React.CSSProperties {
  if (kind === "excluded" || kind === "empty")
    return { background: `repeating-linear-gradient(135deg, ${KIND_COLOR[kind]} 0 3px, #5B6E65 3px 4px)` };
  return { background: KIND_COLOR[kind] };
}
const oneLine = (s: string) => s.replace(/\n/g, " / ");
const firstLine = (s: string) => s.split("\n")[0];

/* ------------------------------ Tooltip ------------------------------ */

type Tip = { x: number; y: number; title: string; rows: { k: string; v: string; kind?: StatusKind }[] } | null;
const TipCtx = createContext<(t: Tip) => void>(() => {});

export function TipLayer({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<Tip>(null);
  return (
    <TipCtx.Provider value={setTip}>
      {children}
      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 min-w-[160px] max-w-[280px] rounded-md border border-line-strong bg-ink-850 px-3 py-2 shadow-panel"
          style={{ left: Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1600) - 300), top: tip.y + 14 }}
        >
          <div className="mb-1 text-2xs text-brand-sage">{tip.title}</div>
          {tip.rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {r.kind && <span className="h-0.5 w-3 rounded" style={{ background: KIND_COLOR[r.kind] }} />}
              <span className="font-num font-medium text-brand-paper">{r.v}</span>
              <span className="text-brand-mist/80">{r.k}</span>
            </div>
          ))}
        </div>
      )}
    </TipCtx.Provider>
  );
}
function useTip() {
  return useContext(TipCtx);
}

/* ------------------------------ KPI ------------------------------ */

export function Kpi({ label, value, unit, sub, tone }: { label: string; value: string | number; unit?: string; sub?: ReactNode; tone?: "danger" | "warn" }) {
  return (
    <div className="rounded-lg border border-line bg-ink-900 p-4">
      <div className="text-2xs text-brand-sage">{label}</div>
      <div className={cn("mt-1.5 font-num text-[28px] font-medium leading-none", tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-brand-paper")}>
        {value}
        {unit && <span className="ml-0.5 text-sm text-brand-sage">{unit}</span>}
      </div>
      {sub && <div className="mt-1.5 text-2xs text-brand-sage">{sub}</div>}
    </div>
  );
}

/* ------------------------------ 图例 ------------------------------ */

export function Legend({ items }: { items: { value: string; kind: StatusKind }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1">
      {items.map((s) => (
        <span key={s.value} className="inline-flex items-center gap-1.5 text-2xs text-brand-mist/80">
          <span className="h-2.5 w-2.5 rounded-sm" style={segStyle(s.kind)} />
          {firstLine(s.value.split("／").length > 1 ? s.value : s.value)}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------ 分组堆叠条 ------------------------------ */

/** 每组一行：条长 = 该组数量（同一刻度），分段 = 各状态；右侧数量与完成率同时以文字给出（不依赖悬停） */
export function StackRows({ rows, groupLabel, unit = "项" }: { rows: StackRow[]; groupLabel: string; unit?: string }) {
  const setTip = useTip();
  const max = Math.max(1, ...rows.map((r) => r.total));
  const legend = uniqSegs(rows.flatMap((r) => r.segs));
  if (!rows.length) return <div className="py-8 text-center text-xs text-brand-sage">暂无数据</div>;
  return (
    <div>
      <div className="mb-3"><Legend items={legend} /></div>
      <div className="grid grid-cols-[minmax(96px,160px)_1fr_auto] items-center gap-x-3 gap-y-2.5">
        <div className="text-2xs text-brand-sage">{groupLabel}</div>
        <div />
        <div className="text-right text-2xs text-brand-sage">数量 · 完成率</div>
        {rows.map((r) => {
          const [a, b] = r.key.split("\n");
          return (
            <Row key={r.key}>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-xs text-brand-mist">{a}</div>
                {b && <div className="truncate text-[10px] text-brand-sage">{b}</div>}
              </div>
              <div
                className="flex h-3.5 gap-[2px]"
                style={{ width: `${(r.total / max) * 100}%`, minWidth: 6 }}
                onMouseLeave={() => setTip(null)}
              >
                {r.segs.map((s, i) => (
                  <div
                    key={s.value}
                    tabIndex={0}
                    aria-label={`${oneLine(r.key)} ${oneLine(s.value)} ${s.count}`}
                    className={cn("h-full outline-none transition hover:brightness-125 focus:brightness-125", i === r.segs.length - 1 && "rounded-r")}
                    style={{ ...segStyle(s.kind), flexGrow: s.count, flexBasis: 0 }}
                    onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, title: oneLine(r.key), rows: [{ k: oneLine(s.value), v: `${s.count} ${unit}`, kind: s.kind }, { k: "占本组", v: `${Math.round((s.count / r.total) * 100)}%` }] })}
                    onFocus={(e) => { const b2 = e.currentTarget.getBoundingClientRect(); setTip({ x: b2.left, y: b2.bottom, title: oneLine(r.key), rows: [{ k: oneLine(s.value), v: `${s.count} ${unit}`, kind: s.kind }] }); }}
                    onBlur={() => setTip(null)}
                  />
                ))}
              </div>
              <div className="whitespace-nowrap text-right font-num text-xs">
                <span className="text-brand-paper">{r.total}</span>
                <span className="mx-1 text-brand-sage">·</span>
                <span className={r.rate >= 100 ? "text-brand-paper" : "text-brand-mist/80"}>{r.rate}%</span>
              </div>
            </Row>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] text-brand-sage">完成率 = 已完成 ÷（数量 − 不适用/中止）。悬停色块查看各状态数量。</p>
    </div>
  );
}
function Row({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
function uniqSegs(segs: Seg[]) {
  const seen = new Map<string, Seg>();
  for (const s of segs) if (!seen.has(s.value)) seen.set(s.value, s);
  return [...seen.values()].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}
const ORDER: StatusKind[] = ["done", "partial", "progress", "hold", "todo", "excluded", "empty"];

/* ------------------------------ 占比条 + 明细表 ------------------------------ */

export function ShareBar({ items, total, unit = "项" }: { items: ShareItem[]; total: number; unit?: string }) {
  const setTip = useTip();
  const shown = items.filter((s) => s.count > 0);
  return (
    <div>
      <div className="flex h-5 gap-[2px] overflow-hidden rounded" onMouseLeave={() => setTip(null)}>
        {shown.map((s) => (
          <div
            key={s.value}
            className="h-full transition hover:brightness-125"
            style={{ ...segStyle(s.kind), flexGrow: s.count, flexBasis: 0 }}
            onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, title: "状态占比", rows: [{ k: oneLine(s.value), v: `${s.count} ${unit} · ${s.pct}%`, kind: s.kind }] })}
          />
        ))}
        {!shown.length && <div className="h-full w-full bg-ink-700" />}
      </div>
      <table className="mt-4 w-full text-xs">
        <tbody>
          {items.map((s) => (
            <tr key={s.value} className="border-b border-line last:border-0">
              <td className="py-1.5 pr-2">
                <span className="inline-flex items-center gap-2 text-brand-mist">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={segStyle(s.kind)} />
                  {oneLine(s.value)}
                </span>
              </td>
              <td className="py-1.5 text-right font-num text-brand-paper">{s.count}</td>
              <td className="w-24 py-1.5 pl-3">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-ink-700">
                    <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: KIND_COLOR[s.kind === "excluded" || s.kind === "empty" ? "todo" : s.kind] }} />
                  </div>
                </div>
              </td>
              <td className="w-12 py-1.5 text-right font-num text-brand-sage">{s.pct}%</td>
            </tr>
          ))}
          <tr>
            <td className="pt-2 text-brand-sage">合计</td>
            <td className="pt-2 text-right font-num text-brand-paper">{total}</td>
            <td />
            <td className="pt-2 text-right font-num text-brand-sage">100%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------ 清单 ------------------------------ */

export function TaskList({
  items, empty, cols, href,
}: {
  items: ListItem[]; empty: string; href?: string;
  cols: { h: string; get: (i: ListItem) => ReactNode; className?: string }[];
}) {
  if (!items.length) return <div className="py-6 text-center text-xs text-brand-sage">{empty}</div>;
  return (
    <div className="max-h-[300px] overflow-y-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>{cols.map((c) => <th key={c.h} className="sticky top-0 border-b border-line bg-ink-900 py-1.5 pr-2 text-left text-[10px] font-medium text-brand-sage">{c.h}</th>)}</tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-b border-line last:border-0 hover:bg-ink-850/60">
              {cols.map((c) => <td key={c.h} className={cn("py-1.5 pr-2 align-top text-brand-mist", c.className)}>{c.get(it)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {href && null}
    </div>
  );
}
