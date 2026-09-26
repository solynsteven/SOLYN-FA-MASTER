"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, AlertTriangle, Clock } from "lucide-react";
import type { FaDash, DdDash } from "@/lib/dashboard";
import { Kpi, StackRows, ShareBar, TaskList, TipLayer, KIND_COLOR, segStyle } from "./charts";
import { statusKind } from "@/lib/status";

function Card({ title, sub, children, action }: { title: string; sub?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-ink-900 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-brand-paper">{title}</div>
          {sub && <div className="mt-0.5 text-2xs text-brand-sage">{sub}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function SectionHead({ eyebrow, title, href }: { eyebrow: string; title: string; href: string }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <div>
        <div className="eyebrow mb-1">{eyebrow}</div>
        <h2 className="text-lg font-medium text-brand-paper">{title}</h2>
      </div>
      <Link href={href} className="btn-secondary btn-sm">进入模块<ChevronRight size={13} /></Link>
    </div>
  );
}

function StatusChip({ v }: { v: string }) {
  const k = statusKind(v);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="h-2 w-2 rounded-sm" style={segStyle(k)} />
      {v}
    </span>
  );
}

export function FaDashboard({ d, href }: { d: FaDash; href: string }) {
  const k = d.kpi;
  return (
    <TipLayer>
      <section>
        <SectionHead eyebrow="Deal Workplan · Dashboard" title="FA 项目管理" href={href} />
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi label="任务总数" value={k.total} sub={`进行中 ${k.progress} · 未开始 ${k.todo}`} />
          <Kpi label="完成率" value={k.rate} unit="%" sub={`已完成 ${k.done}${k.excluded ? ` · 中止 ${k.excluded}` : ""}`} />
          <Kpi label="已延期" value={k.overdue} tone={k.overdue ? "danger" : undefined} sub={d.hasDue ? "计划完成日已过且未完成" : "未配置截止日期字段"} />
          <Kpi label="3 天内到期" value={k.due3} tone={k.due3 ? "warn" : undefined} sub="距计划完成日 ≤ 3 天" />
          <Kpi label="暂缓" value={k.hold} sub="状态为保留／暂缓" />
        </div>
        <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
          <Card title={`各${d.stageLabel.split("／")[0]}任务数与完成度`} sub="条长为任务数，分段为任务状态">
            <StackRows rows={d.byStage} groupLabel={d.stageLabel.split("／")[0]} />
          </Card>
          <Card title="任务状态占比" sub={`共 ${k.total} 项任务`}>
            <ShareBar items={d.status} total={k.total} />
          </Card>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Card
            title="3 天内到期的任务"
            sub="未完成、计划完成日在今天起 3 天内，按剩余天数排序"
            action={<span className="inline-flex items-center gap-1 rounded bg-warn/15 px-1.5 py-0.5 text-2xs text-warn"><Clock size={11} />{d.due3.length} 项</span>}
          >
            <TaskList
              items={d.due3}
              empty="未来 3 天没有到期的任务"
              cols={[
                { h: "任务编号", get: (i) => <span className="font-num text-brand-paper">{i.code}</span>, className: "w-20" },
                { h: "任务", get: (i) => i.title },
                { h: "担当", get: (i) => i.owner, className: "w-24" },
                { h: "计划完成", get: (i) => <span className="font-num">{i.due}</span>, className: "w-24" },
                { h: "剩余", get: (i) => <span className="font-num text-warn">{i.days === 0 ? "今天" : `${i.days} 天`}</span>, className: "w-14" },
                { h: "状态", get: (i) => <StatusChip v={i.status} />, className: "w-32" },
              ]}
            />
          </Card>
          <Card
            title="已延期的任务"
            sub="按延迟天数从多到少"
            action={<span className="inline-flex items-center gap-1 rounded bg-danger/15 px-1.5 py-0.5 text-2xs text-danger"><AlertTriangle size={11} />{d.overdue.length} 项</span>}
          >
            <TaskList
              items={d.overdue}
              empty="当前没有延期任务"
              cols={[
                { h: "任务编号", get: (i) => <span className="font-num text-brand-paper">{i.code}</span>, className: "w-20" },
                { h: "任务", get: (i) => i.title },
                { h: "担当", get: (i) => i.owner, className: "w-24" },
                { h: "计划完成", get: (i) => <span className="font-num">{i.due}</span>, className: "w-24" },
                { h: "延迟", get: (i) => <span className="font-num text-danger">+{i.days} 天</span>, className: "w-14" },
                { h: "状态", get: (i) => <StatusChip v={i.status} />, className: "w-32" },
              ]}
            />
          </Card>
        </div>
        <div className="mt-4">
          <Card title="按任务等级" sub="阶段任务 / 一级任务 / 二级任务的状态构成">
            <StackRows rows={d.byLevel} groupLabel="任务等级" />
          </Card>
        </div>
      </section>
    </TipLayer>
  );
}

export function DdDashboard({ d, href }: { d: DdDash; href: string }) {
  const k = d.kpi;
  return (
    <TipLayer>
      <section>
        <SectionHead eyebrow="Due Diligence · Dashboard" title="DD 管理" href={href} />
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
          <Kpi label="材料总数" value={k.total} />
          <Kpi label="接收完成率" value={k.rate} unit="%" sub="已接收 ÷（总数 − 不适用）" />
          <Kpi label="已接收" value={k.done} />
          <Kpi label="部分接收" value={k.partial} tone={k.partial ? "warn" : undefined} />
          <Kpi label="已请求未收" value={k.progress} />
          <Kpi label="未请求" value={k.todo} sub={k.excluded ? `不适用 ${k.excluded}` : undefined} />
        </div>
        <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
          <Card title={`各${d.categoryLabel.split("／")[0]}的收集情况`} sub="条长为材料数，分段为提出状态">
            <StackRows rows={d.byCategory} groupLabel={d.categoryLabel.split("／")[0]} />
          </Card>
          <Card title="提出状态统计" sub={`共 ${k.total} 项材料`}>
            <ShareBar items={d.status} total={k.total} />
          </Card>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Card title={`按${d.necessityLabel}统计`} sub="各必要度的材料数与接收完成率">
            <StackRows rows={d.byNecessity} groupLabel={d.necessityLabel} />
          </Card>
          <Card
            title={`尚未接收的「${d.topNecessity.split("／")[0]}」材料`}
            sub="未请求排在前面"
            action={<span className="rounded bg-ink-700 px-1.5 py-0.5 text-2xs text-brand-mist">{d.mustOpen.length} 项</span>}
          >
            <TaskList
              items={d.mustOpen}
              empty="必须材料已全部接收"
              cols={[
                { h: "材料前缀编码", get: (i) => <span className="whitespace-nowrap font-num text-brand-paper">{i.code}</span>, className: "w-28" },
                { h: "分类", get: (i) => i.extra, className: "w-24" },
                { h: "资料名称", get: (i) => i.title },
                { h: "状态", get: (i) => <StatusChip v={i.status} />, className: "w-32" },
              ]}
            />
          </Card>
        </div>
      </section>
    </TipLayer>
  );
}

export { KIND_COLOR };
