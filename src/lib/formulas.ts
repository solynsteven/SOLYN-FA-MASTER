/**
 * 计算字段（只读、实时计算、不存库），对应 Excel 模板里的公式列。
 * 字段定义中 formula = 下列 ID 之一；依赖字段按 key 引用（key 创建后不可修改）。
 */
import { statusKind } from "./status";

export type FormulaCtx = { startDate?: string | null; today: string };
type Data = Record<string, unknown>;

export function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function diffDays(a: string, b: string) {
  return Math.round((new Date(a + "T00:00:00Z").getTime() - new Date(b + "T00:00:00Z").getTime()) / 86400000);
}
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

export const FORMULAS: Record<string, { label: string; desc: string; type: "date" | "number" | "text"; calc: (d: Data, c: FormulaCtx) => unknown }> = {
  fa_plan_start: {
    label: "计划开始日",
    desc: "= 项目开始日 + 開始D+（天）。修改项目开始日，全部计划日期自动平移",
    type: "date",
    calc: (d, c) => {
      const o = num(d.start_offset);
      return c.startDate && o !== null ? addDays(c.startDate, o) : null;
    },
  },
  fa_plan_end: {
    label: "计划完成日",
    desc: "= 计划开始日 + 所要日数 − 1",
    type: "date",
    calc: (d, c) => {
      const o = num(d.start_offset);
      const n = num(d.duration);
      return c.startDate && o !== null && n !== null ? addDays(c.startDate, o + n - 1) : null;
    },
  },
  fa_delay_days: {
    label: "延迟天数",
    desc: "已完成：实绩完了日 − 计划完成日；未完成且非中止：今天超过计划完成日的天数；否则 0",
    type: "number",
    calc: (d, c) => {
      const end = str(d.plan_end);
      if (!end) return 0;
      const k = statusKind(d.status);
      if (k === "done") return str(d.actual_end) ? diffDays(String(d.actual_end), end) : 0;
      if (k !== "excluded" && c.today > end) return diffDays(c.today, end);
      return 0;
    },
  },
  dd_prefix: {
    label: "材料前缀编码",
    desc: "= 大类编码-中类编码",
    type: "text",
    calc: (d) => (d.major_code || d.minor_code ? `${d.major_code ?? ""}-${d.minor_code ?? ""}` : null),
  },
};

/** 按字段顺序依次计算（后面的公式可引用前面公式的结果，如 delay 依赖 plan_end） */
export function applyFormulas(fields: { key: string; formula: string | null }[], data: Data, ctx: FormulaCtx): Data {
  const out = { ...data };
  for (const f of fields) {
    if (!f.formula) continue;
    const def = FORMULAS[f.formula];
    if (def) out[f.key] = def.calc(out, ctx);
  }
  return out;
}
