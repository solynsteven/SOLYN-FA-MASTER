"use client";

import type { TField, TMember } from "./types";

export function FieldInput({
  f, value, onChange, disabled, members,
}: { f: TField; value: unknown; onChange: (v: unknown) => void; disabled?: boolean; members: TMember[] }) {
  const v = value ?? "";
  switch (f.type) {
    case "longtext":
      return <textarea className="input min-h-[84px] leading-relaxed" value={String(v)} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
    case "number":
      return <input type="number" className="input font-num" value={v as number | string} disabled={disabled} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
    case "percent":
      return (
        <div className="relative">
          <input type="number" min={0} max={100} step={1} className="input pr-8 font-num" value={v as number | string} disabled={disabled} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-sage">%</span>
        </div>
      );
    case "date":
      return <input type="date" className="input font-num [color-scheme:dark]" value={String(v)} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} />;
    case "select":
      return (
        <select className="input" value={String(v)} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">—</option>
          {f.options.map((o) => <option key={o} value={o}>{o.replace(/\n/g, " / ")}</option>)}
          {v && !f.options.includes(String(v)) && <option value={String(v)}>{String(v)}（非选项值）</option>}
        </select>
      );
    case "multiselect": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1.5">
          {f.options.map((o) => {
            const on = arr.includes(o);
            return (
              <button
                key={o}
                type="button"
                disabled={disabled}
                onClick={() => onChange(on ? arr.filter((x) => x !== o) : [...arr, o])}
                className={`rounded border px-2 py-1 text-xs transition ${on ? "border-brand-mid bg-brand-green/40 text-brand-paper" : "border-line-strong text-brand-sage hover:text-brand-mist"}`}
              >
                {o}
              </button>
            );
          })}
          {f.options.length === 0 && <span className="text-xs text-brand-sage">该字段尚未配置选项</span>}
        </div>
      );
    }
    case "boolean":
      return (
        <select className="input" value={value === true ? "1" : value === false ? "0" : ""} disabled={disabled} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value === "1")}>
          <option value="">—</option>
          <option value="1">是</option>
          <option value="0">否</option>
        </select>
      );
    case "user":
      return (
        <select className="input" value={String(v)} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">—</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      );
    default:
      return <input className="input" value={String(v)} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  }
}
