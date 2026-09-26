import { statusKind, type StatusKind } from "./status";
import { fieldByRole, isOverdue, EMPTY } from "./tracker-stats";
import { diffDays } from "./formulas";
import { compareCode } from "./code-sort";

type F = { key: string; type: string; role: string | null; options: string[]; label: string; formula?: string | null };
type I = { data: Record<string, unknown> };

export type Seg = { value: string; kind: StatusKind; count: number };
export type StackRow = { key: string; total: number; done: number; excluded: number; rate: number; segs: Seg[] };
export type ShareItem = { value: string; kind: StatusKind; count: number; pct: number };
export type ListItem = { code: string; title: string; owner: string; due: string; days: number; status: string; extra?: string };

export const KIND_ORDER: StatusKind[] = ["done", "partial", "progress", "hold", "todo", "excluded", "empty"];

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const first = (v: unknown) => str(v).split("\n")[0];

function statusValues(statusF: F | undefined, items: I[]) {
  const vals = [...(statusF?.options ?? [])];
  for (const it of items) {
    const v = statusF ? str(it.data[statusF.key]) || EMPTY : EMPTY;
    if (!vals.includes(v)) vals.push(v);
  }
  return vals.sort((a, b) => KIND_ORDER.indexOf(statusKind(a === EMPTY ? "" : a)) - KIND_ORDER.indexOf(statusKind(b === EMPTY ? "" : b)));
}

function stack(fields: F[], items: I[], groupF: F | undefined): StackRow[] {
  const statusF = fieldByRole(fields, "status");
  const order = statusValues(statusF, items);
  const groups = new Map<string, I[]>();
  for (const o of groupF?.options ?? []) groups.set(o, []);
  for (const it of items) {
    const g = groupF ? str(it.data[groupF.key]) || EMPTY : "全部";
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(it);
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length)
    .map(([key, list]) => {
      const counts = new Map<string, number>();
      for (const it of list) {
        const v = statusF ? str(it.data[statusF.key]) || EMPTY : EMPTY;
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      const segs = order.filter((v) => counts.get(v)).map((v) => ({ value: v, kind: statusKind(v === EMPTY ? "" : v), count: counts.get(v)! }));
      const done = segs.filter((s) => s.kind === "done").reduce((a, s) => a + s.count, 0);
      const excluded = segs.filter((s) => s.kind === "excluded").reduce((a, s) => a + s.count, 0);
      const base = list.length - excluded;
      return { key, total: list.length, done, excluded, rate: base > 0 ? Math.round((done / base) * 1000) / 10 : 0, segs };
    });
}

function share(fields: F[], items: I[]): ShareItem[] {
  const statusF = fieldByRole(fields, "status");
  const order = statusValues(statusF, items);
  const total = items.length || 1;
  return order
    .map((v) => {
      const count = items.filter((it) => (statusF ? str(it.data[statusF.key]) || EMPTY : EMPTY) === v).length;
      return { value: v, kind: statusKind(v === EMPTY ? "" : v), count, pct: Math.round((count / total) * 1000) / 10 };
    })
    .filter((s) => s.count > 0 || (statusF?.options ?? []).includes(s.value));
}

function kpis(fields: F[], items: I[]) {
  const statusF = fieldByRole(fields, "status");
  const c: Record<StatusKind, number> = { done: 0, partial: 0, progress: 0, hold: 0, todo: 0, excluded: 0, empty: 0 };
  for (const it of items) c[statusKind(statusF ? it.data[statusF.key] : null)]++;
  const base = items.length - c.excluded;
  return { total: items.length, ...c, rate: base > 0 ? Math.round((c.done / base) * 1000) / 10 : 0 };
}

export function buildFaDashboard(fields: F[], items: I[], today: string) {
  const statusF = fieldByRole(fields, "status");
  const dueF = fieldByRole(fields, "due_date");
  const codeF = fieldByRole(fields, "code");
  const titleF = fieldByRole(fields, "title");
  const ownerF = fieldByRole(fields, "owner");
  const delayF = fields.find((f) => f.formula === "fa_delay_days");
  const toItem = (it: I, days: number): ListItem => ({
    code: str(codeF && it.data[codeF.key]), title: first(titleF && it.data[titleF.key]), owner: str(ownerF && it.data[ownerF.key]),
    due: str(dueF && it.data[dueF.key]), days, status: first(statusF && it.data[statusF.key]),
  });
  const open = (it: I) => { const k = statusKind(statusF ? it.data[statusF.key] : null); return k !== "done" && k !== "excluded"; };
  const overdue = items
    .filter((it) => isOverdue(it, dueF, statusF, today))
    .map((it) => toItem(it, delayF ? Number(it.data[delayF.key]) || 0 : diffDays(today, str(dueF && it.data[dueF.key]))))
    .sort((a, b) => b.days - a.days || compareCode(a.code, b.code));
  const due3 = items
    .filter((it) => {
      const d = str(dueF && it.data[dueF.key]);
      if (!d || !open(it)) return false;
      const n = diffDays(d, today);
      return n >= 0 && n <= 3;
    })
    .map((it) => toItem(it, diffDays(str(dueF && it.data[dueF.key]), today)))
    .sort((a, b) => a.days - b.days || compareCode(a.code, b.code));
  return {
    kpi: { ...kpis(fields, items), overdue: overdue.length, due3: due3.length },
    hasDue: !!dueF,
    byStage: stack(fields, items, fieldByRole(fields, "category")),
    byLevel: stack(fields, items, fieldByRole(fields, "priority")),
    status: share(fields, items),
    stageLabel: fieldByRole(fields, "category")?.label ?? "阶段",
    overdue, due3,
  };
}

export function buildDdDashboard(fields: F[], items: I[]) {
  const statusF = fieldByRole(fields, "status");
  const priF = fieldByRole(fields, "priority");
  const codeF = fieldByRole(fields, "code");
  const titleF = fieldByRole(fields, "title");
  const ownerF = fieldByRole(fields, "owner");
  const catF = fieldByRole(fields, "category");
  const topNecessity = priF?.options[0];
  const mustOpen = items
    .filter((it) => {
      const k = statusKind(statusF ? it.data[statusF.key] : null);
      return k !== "done" && k !== "excluded" && (!priF || str(it.data[priF.key]) === topNecessity);
    })
    .map((it): ListItem => ({
      code: str(codeF && it.data[codeF.key]), title: first(titleF && it.data[titleF.key]), owner: str(ownerF && it.data[ownerF.key]),
      due: "", days: 0, status: first(statusF && it.data[statusF.key]), extra: first(catF && it.data[catF.key]).replace(/^\d+\.\s*/, ""),
    }))
    .sort((a, b) => KIND_ORDER.indexOf(statusKind(b.status)) - KIND_ORDER.indexOf(statusKind(a.status)) || compareCode(a.code, b.code));
  return {
    kpi: kpis(fields, items),
    byCategory: stack(fields, items, catF),
    byNecessity: stack(fields, items, priF),
    status: share(fields, items),
    categoryLabel: catF?.label ?? "分类",
    necessityLabel: priF?.label ?? "必要度",
    topNecessity: topNecessity ?? "",
    mustOpen,
  };
}

export type FaDash = ReturnType<typeof buildFaDashboard>;
export type DdDash = ReturnType<typeof buildDdDashboard>;
