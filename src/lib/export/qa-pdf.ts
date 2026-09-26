import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { trackerItems } from "@/db/schema";
import { statusKind } from "@/lib/status";
import { fieldByRole, EMPTY } from "@/lib/tracker-stats";
import { compareCode } from "@/lib/code-sort";
import { fmtDateTime } from "@/lib/format";
import { QA_GROUPS, audienceText, requiredRank, QA_RANK } from "@/lib/qa/groups";
import { createReport, PC, type PCol } from "./pdf-base";
import type { ExportData } from "./data";

type Item = ExportData["items"][number];
type Row = { key: string; label: string; total: number; done: number; progress: number; todo: number; excluded: number; rate: number };

// 状态：已解决 深绿 → 待跟踪 中绿 → 未答复 浅 → 已无效 灰
const K = {
  done: { color: PC.green, dark: true },
  progress: { color: "#5E9C7E", dark: true },
  todo: { color: "#C9D6CE", dark: false },
  excluded: { color: "#ECEFED", dark: false },
} as const;

function kindOf(v: unknown): keyof typeof K {
  const k = statusKind(v);
  if (k === "done") return "done";
  if (k === "excluded") return "excluded";
  if (k === "progress" || k === "partial" || k === "hold") return "progress";
  return "todo";
}

function groupBy(items: Item[], key: string | undefined, statusKey: string | undefined, order: string[] = []) {
  const m = new Map<string, Row>();
  const get = (k: string) => {
    if (!m.has(k)) m.set(k, { key: k, label: k, total: 0, done: 0, progress: 0, todo: 0, excluded: 0, rate: 0 });
    return m.get(k)!;
  };
  for (const o of order) get(o);
  for (const it of items) {
    const v = key ? it.data[key] : null;
    const g = get(v === null || v === undefined || v === "" ? EMPTY : String(v).split("\n")[0]);
    g.total++;
    g[kindOf(statusKey ? it.data[statusKey] : null)]++;
  }
  const rows = [...m.values()].filter((r) => r.total > 0);
  for (const r of rows) {
    const base = r.total - r.excluded;
    r.rate = base > 0 ? Math.round((r.done / base) * 1000) / 10 : 0;
  }
  return rows;
}

export async function buildQaPdf(d: ExportData, viewer: { name: string; group: string | null; isManager: boolean }): Promise<Buffer> {
  const fields = d.fields;
  const statusF = fieldByRole(fields, "status");
  const stageF = fieldByRole(fields, "category");
  const titleF = fieldByRole(fields, "title");
  const codeF = fieldByRole(fields, "code");
  const ownerF = fieldByRole(fields, "owner"); // 提问对象
  const accessF = fieldByRole(fields, "access");
  const askerF = fields.find((f) => f.key === "asker");
  const items = [...d.items].sort((a, b) => compareCode(a.data[codeF?.key ?? ""], b.data[codeF?.key ?? ""]));

  // 项目阶段 = FA 任务编号 → 带出任务名称
  const fa = await db
    .select({ k: trackerItems.externalKey, data: trackerItems.data })
    .from(trackerItems)
    .where(and(eq(trackerItems.projectId, d.project.id), eq(trackerItems.moduleKey, "fa"), isNull(trackerItems.deletedAt)));
  const faTitle = new Map(fa.filter((x) => x.k).map((x) => [x.k!, String(x.data.task ?? "").split("\n")[0]]));

  const R = createReport({ title: "Q&A 问答完成情况报告", en: "Q&A Tracker · Progress Report", docTitle: `${d.project.name} Q&A 问答完成情况报告` });
  const scope = viewer.isManager || viewer.group === "ADM"
    ? "统计范围：全部 Q&A 记录（ADM 视角）"
    : `统计范围：导出人权限组 ${viewer.group} 可阅读的记录（标注为 ${QA_GROUPS.filter((g) => QA_RANK[g] <= requiredRank(viewer.group)).join(" / ")} 的问题）`;
  R.cover(d.project, [d.project.code, d.project.clientName ?? "", `统计日 ${d.ctx.today}`, `生成于 ${fmtDateTime(new Date())}`, `导出人 ${viewer.name}`], scope);

  /* KPI */
  const cnt = { done: 0, progress: 0, todo: 0, excluded: 0 };
  for (const it of items) cnt[kindOf(it.data[statusF?.key ?? ""])]++;
  const base = items.length - cnt.excluded;
  const rate = base > 0 ? Math.round((cnt.done / base) * 1000) / 10 : 0;
  R.kpis([
    { label: "问题总数", value: String(items.length) },
    { label: "已解决", value: String(cnt.done), sub: `解决率 ${rate}%` },
    { label: "待跟踪", value: String(cnt.progress), sub: "已有回复，需继续跟进" },
    { label: "未答复", value: String(cnt.todo), alert: cnt.todo > 0, sub: "尚未取得回复" },
    { label: "已无效", value: String(cnt.excluded), sub: "不计入解决率分母" },
  ]);

  /* 回复状态占比 */
  R.section(`${statusF?.label ?? "回复状态"}占比`, "解决率 = 已解决 ÷（总数 − 已无效）");
  const statusLabels = statusF?.options.length ? statusF.options : ["已解决", "待跟踪", "未答复", "已无效"];
  const byStatus = new Map<string, number>();
  for (const it of items) { const v = String(it.data[statusF?.key ?? ""] ?? "") || EMPTY; byStatus.set(v, (byStatus.get(v) ?? 0) + 1); }
  const order: (keyof typeof K)[] = ["done", "progress", "todo", "excluded"];
  const segs = [...new Set([...statusLabels, ...byStatus.keys()])]
    .map((l) => ({ label: l, n: byStatus.get(l) ?? 0, kind: kindOf(l === EMPTY ? "" : l) }))
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
    .map((s) => ({ label: s.label, n: s.n, color: K[s.kind].color, dark: K[s.kind].dark }));
  R.stack(segs);

  const statCols = (first: string, w = 150, label?: (r: Row) => string): PCol<Row>[] => [
    { h: first, w, get: label ?? ((r) => r.label) },
    { h: "总数", w: 36, align: "right", get: (r) => String(r.total) },
    { h: "已解决", w: 40, align: "right", get: (r) => String(r.done) },
    { h: "待跟踪", w: 40, align: "right", get: (r) => String(r.progress) },
    { h: "未答复", w: 40, align: "right", get: (r) => String(r.todo), color: (r) => (r.todo ? PC.alert : undefined) },
    { h: "已无效", w: 40, align: "right", get: (r) => String(r.excluded) },
    { h: "解决率", w: 0, get: (r) => `${r.rate}%`, bar: (r) => r.rate },
  ];

  /* 按项目阶段 */
  if (stageF) {
    R.section(`按${stageF.label}`, "项目阶段 = FA 任务编号");
    const rows = groupBy(items, stageF.key, statusF?.key).sort((a, b) => (a.key === EMPTY ? 1 : b.key === EMPTY ? -1 : compareCode(a.key, b.key)));
    R.table(rows, statCols("阶段 / 任务", 170, (r) => (faTitle.get(r.key) ? `${r.key}  ${faTitle.get(r.key)}` : r.key)));
  }

  /* 问答双方身份 */
  R.section("问答双方身份", "提问者与提问对象");
  if (askerF) R.table(groupBy(items, askerF.key, statusF?.key), statCols(askerF.label));
  if (ownerF) R.table(groupBy(items, ownerF.key, statusF?.key), statCols(ownerF.label));
  if (askerF && ownerF) {
    const as = [...new Set(items.map((i) => String(i.data[askerF.key] ?? "") || EMPTY))];
    const os = [...new Set(items.map((i) => String(i.data[ownerF.key] ?? "") || EMPTY))];
    if (as.length && os.length && os.length <= 7) {
      type MR = { a: string; n: Map<string, number>; t: number };
      const rows: MR[] = as.map((a) => {
        const n = new Map<string, number>();
        let t = 0;
        for (const it of items) if ((String(it.data[askerF.key] ?? "") || EMPTY) === a) { const o = String(it.data[ownerF.key] ?? "") || EMPTY; n.set(o, (n.get(o) ?? 0) + 1); t++; }
        return { a, n, t };
      });
      R.ensure(60);
      R.text(`${askerF.label} × ${ownerF.label}（问题数）`, 42, R.y, { size: 8.5, bold: true, color: PC.sub });
      R.y += 16;
      R.table(rows, [
        { h: `${askerF.label} ＼ ${ownerF.label}`, w: 150, get: (r) => r.a },
        ...os.map((o) => ({ h: o, w: 0, align: "right" as const, get: (r: MR) => String(r.n.get(o) ?? "—") })),
        { h: "合计", w: 50, align: "right", get: (r) => String(r.t) },
      ]);
    }
  }

  /* 按权限组 */
  if (accessF) {
    const rows = groupBy(items, accessF.key, statusF?.key, [...QA_GROUPS]);
    if (rows.length > 1 || viewer.isManager) {
      R.section(`按${accessF.label}`, "逐级放大：ADM > SEL > EXC > DD");
      R.table(rows, statCols("权限组 · 可见范围", 170, (r) => (r.key === EMPTY ? "（未填写，按 ADM）" : `${r.key} · ${audienceText(r.key)}`)));
    }
  }

  /* 待跟进问题清单 */
  const open = items.filter((it) => { const k = kindOf(it.data[statusF?.key ?? ""]); return k === "todo" || k === "progress"; });
  R.section("待跟进问题清单", open.length ? `未答复 ${cnt.todo} · 待跟踪 ${cnt.progress}` : undefined);
  const g = (k?: { key: string }) => (it: Item) => (k ? String(it.data[k.key] ?? "").split("\n")[0] : "");
  R.table(open, [
    { h: "#", w: 28, get: g(codeF) },
    { h: "阶段", w: 44, get: g(stageF) },
    { h: "提问对象", w: 54, get: g(ownerF) },
    { h: "提问内容", w: 0, get: (it) => (titleF ? String(it.data[titleF.key] ?? "").split("\n")[0] : "") },
    { h: "状态", w: 48, get: g(statusF), color: (it) => (kindOf(it.data[statusF?.key ?? ""]) === "todo" ? PC.alert : PC.mid) },
    ...(accessF ? [{ h: "权限组", w: 40, get: g(accessF) }] : []),
  ], "所有问题均已解决或关闭。");

  /* 已解决问题要点 */
  const solved = items.filter((it) => kindOf(it.data[statusF?.key ?? ""]) === "done");
  if (solved.length) {
    R.section("已解决问题与答复要点", `共 ${solved.length} 项`);
    R.table(solved, [
      { h: "#", w: 28, get: g(codeF) },
      { h: "提问内容", w: 0, get: (it) => (titleF ? String(it.data[titleF.key] ?? "").split("\n")[0] : "") },
      { h: "回答记录", w: 0, get: (it) => String(it.data.answer ?? "").split("\n")[0] || "—" },
    ]);
  }
  return R.finish(d.project.code);
}
