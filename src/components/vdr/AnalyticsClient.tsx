"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Repeat } from "lucide-react";
import type { VdrAnalytics } from "@/lib/vdr/analytics";
import { levelMeta, VDR_ACTION_LABEL } from "@/lib/vdr/constants";
import { fmtDateTime } from "@/lib/format";
import { Kpi, TipLayer } from "@/components/dashboard/charts";
import { cn } from "@/lib/cn";

/* 访问动作与权限级别同色：阅览 = V、打印 = P、下载 = O */
const ACT = [
  { k: "views", label: "阅览", color: levelMeta("V").color },
  { k: "prints", label: "打印", color: levelMeta("P").color },
  { k: "downloads", label: "下载", color: levelMeta("O").color },
] as const;

const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: "活跃", cls: "bg-brand-green/40 text-brand-mist" },
  cooling: { label: "近期未访问", cls: "bg-ink-700 text-brand-sage" },
  stopped: { label: "突然停止", cls: "bg-danger/15 text-danger" },
  none: { label: "从未访问", cls: "bg-ink-700 text-brand-sage/70" },
};

function Spark({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  const w = 112, h = 26;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * (w - 4) + 2},${h - 3 - (v / max) * (h - 6)}`).join(" ");
  const last = data[data.length - 1];
  return (
    <svg width={w} height={h} className="overflow-visible" aria-label={`近 ${data.length} 天：${data.join(",")}`}>
      <line x1="0" x2={w} y1={h - 3} y2={h - 3} stroke="rgba(215,224,218,0.12)" />
      <polyline points={pts} fill="none" stroke="#7C9A8B" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={w - 2} cy={h - 3 - (last / max) * (h - 6)} r="3" fill="#A6E0C1" stroke="#0F241C" strokeWidth="2" />
    </svg>
  );
}

function Card({ title, sub, children, action }: { title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-ink-900 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div><div className="text-sm font-medium text-brand-paper">{title}</div>{sub && <div className="mt-0.5 text-2xs text-brand-sage">{sub}</div>}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function AnalyticsClient({ data: d }: { data: VdrAnalytics }) {
  const [orgFilter, setOrgFilter] = useState("");
  const [actFilter, setActFilter] = useState("");
  const maxOrg = Math.max(1, ...d.orgs.map((o) => o.total));
  const maxGroup = Math.max(1, ...d.groups.map((g) => g.total));
  const stopped = d.orgs.filter((o) => o.status === "stopped");
  const recent = useMemo(() => d.recent.filter((r) => (!orgFilter || r.org === orgFilter) && (!actFilter || r.action === actFilter)), [d.recent, orgFilter, actFilter]);
  const Legend = () => (
    <div className="flex gap-3">
      {ACT.map((a) => <span key={a.k} className="inline-flex items-center gap-1.5 text-2xs text-brand-mist/80"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: a.color }} />{a.label}</span>)}
    </div>
  );
  const Bar = ({ v, p, dl, max }: { v: number; p: number; dl: number; max: number }) => {
    const t = v + p + dl;
    return (
      <div className="flex h-3.5 gap-[2px]" style={{ width: `${(t / max) * 100}%`, minWidth: t ? 4 : 0 }} title={`阅览 ${v} · 打印 ${p} · 下载 ${dl}`}>
        {[v, p, dl].map((n, i) => n > 0 && <div key={i} className={cn("h-full", i === [v, p, dl].map((x, j) => (x > 0 ? j : -1)).filter((j) => j >= 0).pop() && "rounded-r")} style={{ flexGrow: n, flexBasis: 0, background: ACT[i].color }} />)}
      </div>
    );
  };

  return (
    <TipLayer>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Kpi label="文件数" value={d.kpi.files} />
          <Kpi label="外部访问次数" value={d.kpi.accesses} sub={`阅览 ${d.kpi.views} · 打印 ${d.kpi.prints} · 下载 ${d.kpi.downloads}`} />
          <Kpi label="访问用户 / 机构" value={`${d.kpi.users} / ${d.kpi.orgs}`} />
          <Kpi label="近 7 天访问" value={d.kpi.last7} />
          <Kpi label="被反复查看的文件" value={d.kpi.repeatFiles} tone={d.kpi.repeatFiles ? "warn" : undefined} sub={`同一用户查看 ≥ ${d.params.repeatThreshold} 次`} />
          <Kpi label="突然停止访问" value={d.kpi.stopped} tone={d.kpi.stopped ? "danger" : undefined} sub={`近 ${d.params.stopRecentDays} 天 0 次，此前 ≥ ${d.params.stopPriorMin} 次`} />
        </div>

        {stopped.length > 0 && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-sm text-danger"><AlertTriangle size={14} />以下买家突然停止访问，建议跟进</div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-brand-mist">
              {stopped.map((o) => <span key={o.org}><b className="font-medium text-brand-paper">{o.org}</b>（{o.groups.join("/")}）：近 {d.params.sparkDays} 天前段 {o.prior} 次，最近 {o.daysSince} 天无访问，最后访问 {fmtDateTime(o.last)}</span>)}
            </div>
          </div>
        )}

        <Card title="各买家访问强度对比" sub="按所属机构汇总；条长为访问次数，分段为阅览 / 打印 / 下载" action={<Legend />}>
          {d.orgs.length === 0 ? <div className="py-8 text-center text-xs text-brand-sage">尚未设置外部成员或暂无访问。请在「项目管理 → 成员与权限」为成员设置权限组与所属机构。</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] text-brand-sage">
                    <th className="pb-2 pr-3 font-medium">机构</th><th className="pb-2 pr-3 font-medium">权限组</th><th className="w-[30%] pb-2 pr-3 font-medium">访问次数</th>
                    <th className="pb-2 pr-3 text-right font-medium">用户</th><th className="pb-2 pr-3 text-right font-medium">文件</th><th className="pb-2 pr-3 text-right font-medium">活跃天数</th>
                    <th className="pb-2 pr-3 font-medium">近 {d.params.sparkDays} 天</th><th className="pb-2 pr-3 font-medium">最后访问</th><th className="pb-2 font-medium">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {d.orgs.map((o) => (
                    <tr key={o.org} className="border-t border-line">
                      <td className="py-2 pr-3 text-brand-paper">{o.org}</td>
                      <td className="py-2 pr-3 font-num text-brand-sage">{o.groups.join(" / ") || "—"}</td>
                      <td className="py-2 pr-3"><div className="flex items-center gap-2"><div className="flex-1"><Bar v={o.views} p={o.prints} dl={o.downloads} max={maxOrg} /></div><span className="w-10 text-right font-num text-brand-paper">{o.total}</span></div></td>
                      <td className="py-2 pr-3 text-right font-num">{o.users}</td>
                      <td className="py-2 pr-3 text-right font-num">{o.files}</td>
                      <td className="py-2 pr-3 text-right font-num">{o.activeDays}</td>
                      <td className="py-2 pr-3"><Spark data={o.daily} /></td>
                      <td className="py-2 pr-3 whitespace-nowrap font-num text-brand-sage">{o.last ? fmtDateTime(o.last) : "—"}</td>
                      <td className="py-2"><span className={cn("whitespace-nowrap rounded px-1.5 py-0.5 text-2xs", STATUS[o.status].cls)}>{STATUS[o.status].label}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
          <Card title="被查看最多的文件" sub={`前 30 个；带 ↻ 标记的文件被同一用户查看 ≥ ${d.params.repeatThreshold} 次`}>
            {d.topFiles.length === 0 ? <div className="py-8 text-center text-xs text-brand-sage">暂无访问</div> : (
              <div className="max-h-[420px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-[10px] text-brand-sage"><th className="sticky top-0 bg-ink-900 pb-2 font-medium">文件</th><th className="sticky top-0 bg-ink-900 pb-2 text-right font-medium">阅览</th><th className="sticky top-0 bg-ink-900 pb-2 text-right font-medium">打印</th><th className="sticky top-0 bg-ink-900 pb-2 text-right font-medium">下载</th><th className="sticky top-0 bg-ink-900 pb-2 text-right font-medium">人数</th><th className="sticky top-0 bg-ink-900 pb-2 pl-3 font-medium">查看最多的人</th></tr></thead>
                  <tbody>
                    {d.topFiles.map((f) => (
                      <tr key={f.id} className="border-t border-line">
                        <td className="py-1.5 pr-2">
                          <div className="flex items-center gap-1.5 text-brand-paper">{f.repeat && <Repeat size={11} className="shrink-0 text-warn" />}<span className={f.deleted ? "line-through opacity-60" : ""}>{f.name}</span></div>
                          <div className="text-[10px] text-brand-sage">{f.path}{f.taskCode ? ` · ${f.taskCode}` : ""}{f.ddCode ? ` · ${f.ddCode}` : ""}</div>
                        </td>
                        <td className="py-1.5 text-right font-num">{f.views}</td>
                        <td className="py-1.5 text-right font-num">{f.prints}</td>
                        <td className="py-1.5 text-right font-num">{f.downloads}</td>
                        <td className="py-1.5 text-right font-num">{f.viewers}</td>
                        <td className="py-1.5 pl-3 text-brand-sage">{f.maxByOneName ? <>{f.maxByOneName}<span className="text-brand-sage/70">（{f.maxByOneOrg}）</span> <span className={cn("font-num", f.repeat && "text-warn")}>×{f.maxByOne}</span></> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card title="按权限组对比" action={<Legend />}>
            <div className="grid grid-cols-[48px_1fr_auto] items-center gap-x-3 gap-y-3">
              {d.groups.map((g) => (
                <div key={g.group} className="contents">
                  <span className="font-num text-xs text-brand-mist">{g.group}</span>
                  <Bar v={g.views} p={g.prints} dl={g.downloads} max={maxGroup} />
                  <span className="whitespace-nowrap text-right font-num text-xs"><span className="text-brand-paper">{g.total}</span><span className="text-brand-sage"> · {g.users} 人</span></span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card title="访问日志" sub="最近 200 条阅览 / 打印 / 下载记录（含内部人员，已标注）"
          action={
            <div className="flex gap-2">
              <select className="input w-auto py-1 text-xs" value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}>
                <option value="">全部机构</option>
                {[...new Set(d.recent.map((r) => r.org))].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <select className="input w-auto py-1 text-xs" value={actFilter} onChange={(e) => setActFilter(e.target.value)}>
                <option value="">全部动作</option><option value="view">阅览</option><option value="print">打印</option><option value="download">下载</option>
              </select>
            </div>
          }>
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-[10px] text-brand-sage"><th className="sticky top-0 bg-ink-900 pb-2 font-medium">时间</th><th className="sticky top-0 bg-ink-900 pb-2 font-medium">用户</th><th className="sticky top-0 bg-ink-900 pb-2 font-medium">机构 / 权限组</th><th className="sticky top-0 bg-ink-900 pb-2 font-medium">动作</th><th className="sticky top-0 bg-ink-900 pb-2 font-medium">文件</th><th className="sticky top-0 bg-ink-900 pb-2 font-medium">IP</th></tr></thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="py-1.5 pr-2 whitespace-nowrap font-num text-brand-sage">{fmtDateTime(r.at)}</td>
                    <td className="py-1.5 pr-2 text-brand-paper">{r.user}{r.internal && <span className="ml-1 text-[10px] text-brand-sage">（内部）</span>}</td>
                    <td className="py-1.5 pr-2 text-brand-sage">{r.org}{r.group ? ` · ${r.group}` : ""}</td>
                    <td className="py-1.5 pr-2"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: ACT.find((a) => a.k.startsWith(r.action.slice(0, 4)))?.color }} />{VDR_ACTION_LABEL[r.action]}</span></td>
                    <td className="py-1.5 pr-2 text-brand-mist">{r.file}</td>
                    <td className="py-1.5 font-num text-brand-sage/70">{r.ip}</td>
                  </tr>
                ))}
                {recent.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-brand-sage">暂无记录</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </TipLayer>
  );
}
