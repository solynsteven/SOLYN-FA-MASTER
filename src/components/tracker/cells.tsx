"use client";

import { Badge } from "@/components/ui";
import { displayValue } from "@/lib/fields";
import { statusKind } from "@/lib/status";
import type { TField } from "./types";

export function statusTone(v: unknown): "green" | "mid" | "warn" | "danger" | "neutral" {
  const k = statusKind(v);
  if (k === "done") return "green";
  if (/延期|逾期|风险|阻塞|滞后/.test(String(v ?? ""))) return "danger";
  if (k === "hold" || k === "partial") return "warn";
  if (k === "progress") return "mid";
  return "neutral";
}

export function priorityTone(v: unknown): "danger" | "warn" | "outline" {
  const s = String(v ?? "");
  if (/^(高|紧急|重要|high|urgent|p0|p1|a)$/i.test(s.trim())) return "danger";
  if (/^(中|一般|medium|normal|p2|b)$/i.test(s.trim())) return "warn";
  return "outline";
}

/** FA 任务层级：阶段任务=0（分组行），一级任务=1，二级任务=2 */
export function levelDepth(v: unknown) {
  const s = String(v ?? "");
  if (/阶段|フェーズ|phase/i.test(s)) return 0;
  if (/二级|二級|サブ|sub/i.test(s)) return 2;
  return 1;
}

/** 中日双语文本：第一行主文，其余行作为副文 */
function Bilingual({ text, strong, clamp }: { text: string; strong?: boolean; clamp?: boolean }) {
  const [a, ...rest] = text.split("\n");
  return (
    <span className="block">
      <span className={strong ? "text-brand-paper" : ""}>{a}</span>
      {rest.length > 0 && <span className={`block text-2xs leading-4 text-brand-sage ${clamp ? "line-clamp-1" : ""}`}>{rest.join(" ")}</span>}
    </span>
  );
}

export function Cell({ f, v, overdue, users, depth = 1 }: { f: TField; v: unknown; overdue?: boolean; users: Map<string, string>; depth?: number }) {
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return <span className="text-brand-sage/40">—</span>;
  if (f.role === "access") return <Badge tone={v === "ADM" ? "green" : v === "SEL" ? "mid" : "outline"} className="font-num tracking-wide">{String(v)}</Badge>;
  if (f.role === "status") return <Badge tone={statusTone(v)}>{String(v)}</Badge>;
  if (f.role === "priority" && /任务|任務/.test(String(v))) return <span className={depth === 0 ? "text-xs font-medium text-brand-paper" : "text-xs text-brand-mist/80"}>{String(v)}</span>;
  if (f.role === "priority") return <Badge tone={priorityTone(v)}>{String(v)}</Badge>;
  if (f.role === "title")
    return (
      <div style={{ paddingLeft: Math.max(0, depth - 1) * 14 }} className={`flex gap-1.5 ${depth === 0 ? "font-medium" : ""}`}>
        {depth >= 2 && <span className="text-brand-sage">└</span>}
        <Bilingual text={String(v)} strong clamp />
      </div>
    );
  if (f.formula && f.type === "number" && Number(v) > 0 && f.formula.includes("delay")) return <span className="font-num text-danger">+{String(v)}</span>;
  if (f.type === "percent" || f.role === "progress") {
    const n = Math.max(0, Math.min(100, Number(v) || 0));
    return (
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-ink-700">
          <div className="h-full rounded-full bg-brand-sage" style={{ width: `${n}%` }} />
        </div>
        <span className="font-num text-xs text-brand-mist">{Number(v)}%</span>
      </div>
    );
  }
  if (f.type === "date") return <span className={`whitespace-nowrap font-num text-xs ${overdue ? "text-danger" : f.formula ? "text-brand-mist/80" : ""}`}>{String(v)}</span>;
  if (f.type === "number") return <span className={`font-num ${f.formula ? "text-brand-sage" : ""}`}>{Number(v).toLocaleString("zh-CN")}</span>;
  if (f.type === "multiselect" && Array.isArray(v))
    return <div className="flex flex-wrap gap-1">{v.map((x) => <Badge key={String(x)} tone="outline">{String(x)}</Badge>)}</div>;
  if (f.type === "select") return <Bilingual text={String(v)} clamp />;
  if (f.type === "longtext") return <span className="line-clamp-2 whitespace-pre-line text-brand-mist/85">{String(v)}</span>;
  return <span>{displayValue(f.type, v, users)}</span>;
}
