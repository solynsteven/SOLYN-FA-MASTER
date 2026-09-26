"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Search, History, Upload, Download, Columns3, ArrowUp, ArrowDown, Trash2, X, FileSpreadsheet, FileText, Settings2,
  ChevronRight, ChevronDown, AlertTriangle, ListTree,
} from "lucide-react";
import { Alert, ConfirmButton, EmptyState, cn, useAction } from "@/components/ui";
import { ImportDialog } from "./ImportDialog";
import { StartDateControl } from "./StartDateControl";
import { useHierarchy } from "./useHierarchy";
import { compareCode, sortByCode } from "@/lib/code-sort";
import { Cell } from "./cells";
import { ItemDrawer } from "./ItemDrawer";
import { trackerSummary, isOverdue as overdueOf } from "@/lib/tracker-stats";
import { fmtDateTime } from "@/lib/format";
import type { TField, TItem, TMember } from "./types";
import { deleteItemsAction } from "@/app/p/[projectId]/[module]/actions";

type Props = {
  projectId: string; moduleKey: "fa" | "dd"; moduleLabel: string; itemLabel: string;
  fields: TField[]; items: TItem[]; members: TMember[]; canManage: boolean; today: string; startDate: string | null;
};

const opt = (s: string) => s.replace(/\n/g, " / ");

const STATUS_COLORS = ["#275642", "#3F6E58", "#7C9A8B", "#A9BDB2", "#D7E0DA", "#4F5F58", "#2E3A35"];

export function TrackerClient(p: Props) {
  const router = useRouter();
  const { fields, items, canManage, today } = p;
  const users = useMemo(() => new Map(p.members.map((m) => [m.id, m.name])), [p.members]);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [colMenu, setColMenu] = useState(false);
  const [open, setOpen] = useState<TItem | "new" | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const bulk = useAction();

  const storeKey = `solyn.cols.${p.projectId}.${p.moduleKey}`;
  useEffect(() => {
    try {
      const v = localStorage.getItem(storeKey);
      if (v) setHidden(JSON.parse(v));
    } catch {}
  }, [storeKey]);
  const saveHidden = (h: string[]) => {
    setHidden(h);
    try { localStorage.setItem(storeKey, JSON.stringify(h)); } catch {}
  };

  const statusF = fields.find((f) => f.role === "status");
  const dueF = fields.find((f) => f.role === "due_date");
  const filterFields = fields.filter((f) => f.type === "select" && (f.role === "category" || f.role === "status" || f.role === "priority")).slice(0, 4);
  // 任务编号为主索引：固定在第一列（替代 # 序号列），默认按编号自然排序
  const codeF = fields.find((f) => f.role === "code");
  const cols = fields.filter((f) => f.showInTable && !hidden.includes(f.key) && f.key !== codeF?.key);
  const H = useHierarchy(p.moduleKey, fields, items);
  const collapseKey = `solyn.collapsed.${p.projectId}.${p.moduleKey}`;
  const [collapsed, setCollapsedRaw] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const v = localStorage.getItem(collapseKey);
      if (v) setCollapsedRaw(new Set(JSON.parse(v)));
    } catch {}
  }, [collapseKey]);
  const setCollapsed = (fn: Set<string> | ((c: Set<string>) => Set<string>)) =>
    setCollapsedRaw((c) => {
      const n = typeof fn === "function" ? fn(c) : fn;
      try { localStorage.setItem(collapseKey, JSON.stringify([...n])); } catch {}
      return n;
    });
  const toggleCollapse = (code: string) => setCollapsed((c) => { const n = new Set(c); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  const issueCount = H.enabled ? items.filter((i) => H.issueOf(i)).length : 0;
  const [onlyIssues, setOnlyIssues] = useState(false);
  const hasPlanFormula = fields.some((f) => f.formula === "fa_plan_start" || f.formula === "fa_plan_end");

  const isOverdue = (it: TItem) => overdueOf(it, dueF, statusF, today);

  const view = useMemo(() => {
    let r = codeF ? sortByCode(items, codeF.key) : items;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      r = r.filter((it) => Object.values(it.data).some((v) => v !== null && String(Array.isArray(v) ? v.join(" ") : v).toLowerCase().includes(s)));
    }
    for (const [k, v] of Object.entries(filters)) {
      if (!v) continue;
      r = r.filter((it) => (v === "__empty" ? !it.data[k] : String(it.data[k] ?? "") === v));
    }
    if (onlyOverdue) r = r.filter(isOverdue);
    if (onlyIssues) r = r.filter((i) => H.issueOf(i));
    if (sort) {
      const f = fields.find((x) => x.key === sort.key);
      r = [...r].sort((a, b) => {
        const va = sort.key === "__seq" ? a.seq : sort.key === "__updated" ? a.updatedAt : a.data[sort.key];
        const vb = sort.key === "__seq" ? b.seq : sort.key === "__updated" ? b.updatedAt : b.data[sort.key];
        if (f?.role === "code") return compareCode(va, vb) * sort.dir;
        if (va == null || va === "") return 1;
        if (vb == null || vb === "") return -1;
        if (f && f.type === "select" && f.options.length) return (f.options.indexOf(String(va)) - f.options.indexOf(String(vb))) * sort.dir;
        if (typeof va === "number" && typeof vb === "number") return (va - vb) * sort.dir;
        return String(va).localeCompare(String(vb), "zh-CN", { numeric: true }) * sort.dir;
      });
    }
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q, filters, onlyOverdue, onlyIssues, sort, fields, H]);
  // 树形折叠：仅在未筛选、未排序时生效
  const treeMode = H.enabled && !sort && !q.trim() && !Object.values(filters).some(Boolean) && !onlyOverdue && !onlyIssues;
  const rows = treeMode && collapsed.size ? view.filter((it) => !H.ancestors(H.codeOf(it)).some((a) => collapsed.has(a))) : view;
  const parentCodes = H.enabled ? items.map(H.codeOf).filter((c) => H.childrenOf(c).length) : [];

  const sum = useMemo(() => trackerSummary(fields, items, today), [fields, items, today]);
  const activeFilters = Object.values(filters).filter(Boolean).length + (onlyOverdue ? 1 : 0) + (onlyIssues ? 1 : 0) + (q ? 1 : 0);
  const toggleSort = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));
  const allChecked = view.length > 0 && view.every((i) => selected.has(i.id));

  return (
    <>
      {hasPlanFormula && <StartDateControl projectId={p.projectId} startDate={p.startDate} canManage={canManage} />}
      {/* KPI */}
      <div className="mb-5 grid gap-3 md:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,2fr)]">
        <Kpi label={`${p.itemLabel}总数`} value={sum.total} />
        <Kpi label="已完成" value={sum.done} sub={`完成率 ${sum.rate}%（已剔除不适用/中止）`} />
        {sum.hasDue ? (
          <>
            <Kpi label="已逾期" value={sum.overdue} tone={sum.overdue ? "danger" : undefined} sub="计划完成日已过且未完成 · 点击筛选" onClick={() => setOnlyOverdue((v) => !v)} active={onlyOverdue} />
            <Kpi label="7 天内到期" value={sum.dueSoon} sub={sum.excluded ? `另有 ${sum.excluded} 项中止/不适用` : undefined} />
          </>
        ) : (
          <>
            <Kpi label="未完成" value={sum.open} sub={sum.partial ? `其中部分接收 ${sum.partial} 项` : "不含不适用项"} />
            <Kpi label="不适用" value={sum.excluded} sub="不计入完成率分母" />
          </>
        )}
        <div className="card p-4">
          <div className="eyebrow">{statusF ? `${statusF.label}分布` : "状态分布"}</div>
          {statusF && sum.total ? (
            <>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-ink-700">
                {[...sum.byStatus].filter(([, n]) => n > 0).map(([k, n], i) => (
                  <div key={k} title={`${opt(k)} ${n}`} style={{ width: `${(n / sum.total) * 100}%`, background: STATUS_COLORS[i % STATUS_COLORS.length] }} />
                ))}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
                {[...sum.byStatus].filter(([, n]) => n > 0).map(([k, n], i) => (
                  <button key={k} onClick={() => setFilters((f) => ({ ...f, [statusF.key]: f[statusF.key] === k ? "" : k }))} className="flex items-center gap-1.5 text-2xs text-brand-mist/80 hover:text-brand-paper">
                    <span className="h-2 w-2 rounded-sm" style={{ background: STATUS_COLORS[i % STATUS_COLORS.length] }} />
                    {opt(k)} <span className="font-num text-brand-sage">{n}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-3 text-xs text-brand-sage">{statusF ? "暂无数据" : "在字段配置中为某字段设置「状态」角色后显示"}</div>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="relative w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-sage" />
            <input className="input py-1.5 pl-8" placeholder="搜索全部字段" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {filterFields.map((f) => (
            <select
              key={f.key}
              className={cn("input w-auto min-w-[112px] py-1.5 text-xs", filters[f.key] && "border-brand-mid text-brand-paper")}
              value={filters[f.key] ?? ""}
              onChange={(e) => setFilters((x) => ({ ...x, [f.key]: e.target.value }))}
            >
              <option value="">{f.label}：全部</option>
              {f.options.map((o) => <option key={o} value={o}>{opt(o)}</option>)}
              <option value="__empty">（未填写）</option>
            </select>
          ))}
          {activeFilters > 0 && (
            <button className="btn-ghost btn-sm" onClick={() => { setQ(""); setFilters({}); setOnlyOverdue(false); setOnlyIssues(false); }}>
              <X size={13} />清除筛选
            </button>
          )}
          {H.enabled && (
            <>
              <button className="btn-ghost btn-sm" disabled={!treeMode} title={treeMode ? "" : "筛选或排序时显示全部任务"} onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(parentCodes))}>
                <ListTree size={13} />{collapsed.size ? "全部展开" : "全部折叠"}
              </button>
              {issueCount > 0 && (
                <button className={cn("btn-sm btn border", onlyIssues ? "border-warn bg-warn/15 text-warn" : "border-warn/40 text-warn hover:bg-warn/10")} onClick={() => setOnlyIssues((v) => !v)}>
                  <AlertTriangle size={13} />从属关系待修正 {issueCount}
                </button>
              )}
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            {selected.size > 0 && canManage && (
              <ConfirmButton
                className="btn-danger btn-sm"
                title="批量删除"
                confirmText={`删除 ${selected.size} 条`}
                body={`确定删除选中的 ${selected.size} 条记录？删除日期会被记录，可在「变更记录」中逐条恢复。`}
                onConfirm={() => bulk.exec(() => deleteItemsAction(p.projectId, p.moduleKey, [...selected]), () => { setSelected(new Set()); router.refresh(); })}
              >
                <Trash2 size={13} />删除所选（{selected.size}）
              </ConfirmButton>
            )}
            <div className="relative">
              <button className="btn-secondary btn-sm" onClick={() => setColMenu((v) => !v)}><Columns3 size={13} />列</button>
              {colMenu && (
                <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-md border border-line-strong bg-ink-850 p-2 shadow-panel" onMouseLeave={() => setColMenu(false)}>
                  <div className="px-1 pb-1.5 text-2xs text-brand-sage">显示的列（仅对本浏览器生效）</div>
                  {fields.filter((f) => f.showInTable && f.key !== codeF?.key).map((f) => (
                    <label key={f.key} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-brand-mist hover:bg-ink-700">
                      <input type="checkbox" className="accent-[#3F6E58]" checked={!hidden.includes(f.key)} onChange={() => saveHidden(hidden.includes(f.key) ? hidden.filter((x) => x !== f.key) : [...hidden, f.key])} />
                      {f.label}
                    </label>
                  ))}
                  {canManage && (
                    <Link href={`/p/${p.projectId}/settings?tab=${p.moduleKey}`} className="mt-1 flex items-center gap-1.5 border-t border-line px-1.5 pt-2 text-2xs text-brand-sage hover:text-brand-paper">
                      <Settings2 size={12} />管理字段定义
                    </Link>
                  )}
                </div>
              )}
            </div>
            <Link href={`/p/${p.projectId}/${p.moduleKey}/history`} className="btn-secondary btn-sm"><History size={13} />变更记录</Link>
            {canManage && <button className="btn-secondary btn-sm" onClick={() => setImporting(true)}><Upload size={13} />导入 Excel</button>}
            <div className="relative">
              <button className="btn-secondary btn-sm" onClick={() => setExportMenu((v) => !v)}><Download size={13} />导出</button>
              {exportMenu && (
                <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-md border border-line-strong bg-ink-850 p-1 shadow-panel" onMouseLeave={() => setExportMenu(false)}>
                  <a href={`/p/${p.projectId}/${p.moduleKey}/export?format=xlsx`} onClick={() => setExportMenu(false)} className="flex items-start gap-2.5 rounded px-2.5 py-2 hover:bg-ink-700">
                    <FileSpreadsheet size={16} className="mt-0.5 text-brand-sage" />
                    <span><span className="block text-xs text-brand-paper">Excel 跟踪表</span><span className="block text-2xs text-brand-sage">全部字段 + 统计汇总 + 变更记录</span></span>
                  </a>
                  <a href={`/p/${p.projectId}/${p.moduleKey}/export?format=pdf`} onClick={() => setExportMenu(false)} className="flex items-start gap-2.5 rounded px-2.5 py-2 hover:bg-ink-700">
                    <FileText size={16} className="mt-0.5 text-brand-sage" />
                    <span><span className="block text-xs text-brand-paper">PDF 完成情况报告</span><span className="block text-2xs text-brand-sage">种类、级别、状态占比与重点事项</span></span>
                  </a>
                </div>
              )}
            </div>
            {canManage && <button className="btn-primary btn-sm" onClick={() => setOpen("new")}><Plus size={14} />新增{p.itemLabel}</button>}
          </div>
        </div>
        <Alert>{bulk.error}</Alert>

        {items.length === 0 ? (
          <EmptyState
            icon={<FileSpreadsheet size={28} strokeWidth={1.3} />}
            title={`还没有${p.itemLabel}记录`}
            desc={canManage ? `点击「导入 Excel」上传进度表批量导入，或点击「新增${p.itemLabel}」逐条录入。` : "项目管理员录入后将显示在这里。"}
            action={canManage && <button className="btn-primary" onClick={() => setOpen("new")}><Plus size={14} />新增{p.itemLabel}</button>}
          />
        ) : (
          <div className="max-h-[calc(100vh-330px)] min-h-[320px] overflow-auto">
            <table className="w-max min-w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  {canManage && (
                    <th className="th sticky left-0 z-20 w-10">
                      <input type="checkbox" className="accent-[#3F6E58]" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(view.map((i) => i.id)))} />
                    </th>
                  )}
                  {codeF ? (
                    <SortTh label={codeF.label} k={codeF.key} sort={sort} onSort={toggleSort} width={Math.max(codeF.width, H.enabled ? 130 : 80)} sticky={canManage ? 40 : 0} />
                  ) : (
                    <SortTh label="#" k="__seq" sort={sort} onSort={toggleSort} width={56} />
                  )}
                  {cols.map((f) => <SortTh key={f.key} label={f.label} k={f.key} sort={sort} onSort={toggleSort} width={f.width} />)}
                  <SortTh label="最后更新" k="__updated" sort={sort} onSort={toggleSort} width={150} />
                </tr>
              </thead>
              <tbody>
                {rows.map((it) => {
                  const od = isOverdue(it);
                  const depth = H.enabled ? H.depthOf(it) : 1;
                  const code = H.codeOf(it);
                  const kids = H.enabled ? H.childrenOf(code).length : 0;
                  const issue = H.enabled ? H.issueOf(it) : null;
                  const roll = kids ? H.rollup(code) : null;
                  return (
                    <tr key={it.id} className={cn("group cursor-pointer hover:bg-ink-850/80", depth === 0 && "bg-ink-800/70 [&>td]:border-line-strong")} onClick={() => setOpen(it)}>
                      {canManage && (
                        <td className="td sticky left-0 bg-ink-900 group-hover:bg-ink-850" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="accent-[#3F6E58]"
                            checked={selected.has(it.id)}
                            onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; })}
                          />
                        </td>
                      )}
                      {codeF ? (
                        <td
                          className={cn("td sticky z-[5] whitespace-nowrap font-num", depth === 0 ? "bg-[#152f25] group-hover:bg-ink-850" : "bg-ink-900 group-hover:bg-ink-850")}
                          style={{ left: canManage ? 40 : 0 }}
                        >
                          <span className="inline-flex items-center gap-1" style={{ paddingLeft: H.enabled ? depth * 14 : 0 }} title={issue ?? undefined}>
                            {H.enabled && (kids > 0 ? (
                              <button
                                type="button"
                                disabled={!treeMode}
                                title={treeMode ? (collapsed.has(code) ? `展开 ${kids} 个下级任务` : `收起 ${kids} 个下级任务`) : "筛选或排序时显示全部任务"}
                                onClick={(e) => { e.stopPropagation(); toggleCollapse(code); }}
                                className="-ml-1 rounded p-0.5 text-brand-mist hover:bg-ink-700 hover:text-brand-paper disabled:opacity-40"
                              >
                                {treeMode && collapsed.has(code) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                              </button>
                            ) : <span className="inline-block w-[18px]" />)}
                            {issue && <AlertTriangle size={12} className="shrink-0 text-warn" />}
                            <span className={depth === 0 ? "font-medium text-brand-paper" : "text-brand-mist"}>{code || "—"}</span>
                            {kids > 0 && treeMode && collapsed.has(code) && <span className="rounded bg-ink-700 px-1 text-[10px] text-brand-sage">+{roll?.total ?? kids}</span>}
                          </span>
                        </td>
                      ) : (
                        <td className="td font-num text-xs text-brand-sage">{it.seq}</td>
                      )}
                      {cols.map((f) => (
                        <td key={f.key} className="td" style={{ maxWidth: f.width, minWidth: Math.min(f.width, 120) }}>
                          <Cell f={f} v={it.data[f.key]} users={users} overdue={od && f.role === "due_date"} depth={depth} />
                          {f.role === "title" && roll && roll.total > 0 && (
                            <div className="mt-1 text-[10px] text-brand-sage" style={{ paddingLeft: Math.max(0, depth - 1) * 14 + (depth >= 2 ? 18 : 0) }}>
                              下级 {roll.total} 项 · 已完成 {roll.done}{roll.excluded ? ` · 中止 ${roll.excluded}` : ""}
                              {collapsed.has(code) && treeMode && <span className="ml-1.5 text-brand-mist/70">（已折叠）</span>}
                            </div>
                          )}
                        </td>
                      ))}
                      <td className="td whitespace-nowrap font-num text-xs text-brand-sage">{fmtDateTime(it.updatedAt)}</td>
                    </tr>
                  );
                })}
                {view.length === 0 && (
                  <tr><td className="td py-10 text-center text-brand-sage" colSpan={cols.length + 3}>没有符合筛选条件的记录</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {items.length > 0 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-2xs text-brand-sage">
            <span>显示 {rows.length} / {items.length} 条{codeF ? ` · 按${codeF.label}排序` : ""}{H.enabled && treeMode ? " · 点击编号前的箭头收起 / 展开下级任务" : ""}</span>
            <span>点击任一行查看详情{canManage ? "与编辑" : ""}；每个字段的更新时间在详情中可见</span>
          </div>
        )}
      </div>

      {open && (
        <ItemDrawer
          key={open === "new" ? "new" : open.id}
          projectId={p.projectId}
          moduleKey={p.moduleKey}
          fields={fields}
          item={open === "new" ? null : open}
          members={p.members}
          canManage={canManage}
          titleLabel={p.itemLabel}
          hierarchy={H}
          onOpenItem={(x: TItem) => setOpen(x)}
          onClose={() => setOpen(null)}
        />
      )}

      {importing && <ImportDialog projectId={p.projectId} moduleKey={p.moduleKey} onClose={() => setImporting(false)} />}
    </>
  );
}

function Kpi({ label, value, sub, tone, onClick, active }: { label: string; value: number; sub?: string; tone?: "danger"; onClick?: () => void; active?: boolean }) {
  const C = onClick ? "button" : "div";
  return (
    <C onClick={onClick} className={cn("card p-4 text-left", onClick && "transition hover:border-line-strong", active && "border-danger/50")}>
      <div className="eyebrow">{label}</div>
      <div className={cn("mt-2 font-num text-[28px] font-medium leading-none", tone === "danger" ? "text-danger" : "text-brand-paper")}>{value}</div>
      {sub && <div className="mt-1.5 text-2xs text-brand-sage">{sub}</div>}
    </C>
  );
}

function SortTh({ label, k, sort, onSort, width, sticky }: { label: string; k: string; sort: { key: string; dir: 1 | -1 } | null; onSort: (k: string) => void; width: number; sticky?: number }) {
  const on = sort?.key === k;
  return (
    <th
      className={cn("th cursor-pointer select-none whitespace-nowrap hover:text-brand-mist", sticky !== undefined && "z-20")}
      style={{ minWidth: Math.min(width, 130), width, ...(sticky !== undefined ? { left: sticky } : {}) }}
      onClick={() => onSort(k)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {on && (sort!.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </span>
    </th>
  );
}
