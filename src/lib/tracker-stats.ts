import { statusKind, isDone, isExcluded } from "./status";
import { diffDays } from "./formulas";

export { isDone, isExcluded };

type F = { key: string; type: string; role: string | null; options: string[]; label?: string };
type I = { data: Record<string, unknown> };

export function fieldByRole<T extends F>(fields: T[], role: string) {
  return fields.find((f) => f.role === role);
}

export const EMPTY = "（未填写）";

export function countBy(items: I[], field?: F) {
  const m = new Map<string, number>();
  if (!field) return m;
  for (const o of field.options) m.set(o, 0);
  for (const it of items) {
    const v = it.data[field.key];
    const vs = Array.isArray(v) ? v : [v];
    for (const x of vs) {
      const k = x === null || x === undefined || x === "" ? EMPTY : String(x);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
  }
  return m;
}

export function isOverdue(item: I, due?: F, status?: F, today?: string) {
  if (!due || !status || !today) return false;
  const d = item.data[due.key];
  const k = statusKind(item.data[status.key]);
  return typeof d === "string" && d < today && k !== "done" && k !== "excluded";
}

/** 完成率 = 已完成 ÷（总数 − 不适用/中止），与 Excel「進捗サマリー」口径一致 */
export function trackerSummary(fields: F[], items: I[], today: string) {
  const status = fieldByRole(fields, "status");
  const due = fieldByRole(fields, "due_date");
  const total = items.length;
  let done = 0, excluded = 0, partial = 0, progress = 0, overdue = 0, dueSoon = 0;
  for (const i of items) {
    const k = status ? statusKind(i.data[status.key]) : "empty";
    if (k === "done") done++;
    else if (k === "excluded") excluded++;
    else if (k === "partial") partial++;
    else if (k === "progress") progress++;
    if (isOverdue(i, due, status, today)) overdue++;
    else if (due && status && k !== "done" && k !== "excluded") {
      const d = i.data[due.key];
      if (typeof d === "string") {
        const n = diffDays(d, today);
        if (n >= 0 && n <= 7) dueSoon++;
      }
    }
  }
  const base = total - excluded;
  return {
    total, done, excluded, partial, progress, overdue, dueSoon, open: base - done,
    rate: base > 0 ? Math.round((done / base) * 1000) / 10 : 0,
    byStatus: countBy(items, status),
    hasDue: !!due,
  };
}

export type GroupRow = { key: string; total: number; done: number; partial: number; progress: number; excluded: number; open: number; overdue: number; rate: number };

/** 按某字段分组统计（PDF 报告：按种类 / 级别） */
export function groupStats(fields: F[], items: I[], groupField: F | undefined, today: string): GroupRow[] {
  if (!groupField) return [];
  const status = fieldByRole(fields, "status");
  const due = fieldByRole(fields, "due_date");
  const order = [...groupField.options];
  const m = new Map<string, GroupRow>();
  const get = (k: string) => {
    if (!m.has(k)) m.set(k, { key: k, total: 0, done: 0, partial: 0, progress: 0, excluded: 0, open: 0, overdue: 0, rate: 0 });
    return m.get(k)!;
  };
  for (const o of order) get(o);
  for (const it of items) {
    const v = it.data[groupField.key];
    const g = get(v === null || v === undefined || v === "" ? EMPTY : String(v));
    g.total++;
    const k = status ? statusKind(it.data[status.key]) : "empty";
    if (k === "done") g.done++;
    else if (k === "excluded") g.excluded++;
    else if (k === "partial") g.partial++;
    else if (k === "progress") g.progress++;
    if (isOverdue(it, due, status, today)) g.overdue++;
  }
  const rows = [...m.values()].filter((r) => r.total > 0);
  for (const r of rows) {
    const base = r.total - r.excluded;
    r.open = base - r.done;
    r.rate = base > 0 ? Math.round((r.done / base) * 1000) / 10 : 0;
  }
  return rows;
}

/** 双语选项「中文\n日文」或「中文／日文」只取第一行用于紧凑显示 */
export function shortLabel(s: string) {
  return s.split("\n")[0].trim();
}
