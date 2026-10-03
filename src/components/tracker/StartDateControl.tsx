"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { Alert, useAction } from "@/components/ui";
import { setFaStartDate } from "@/app/p/[projectId]/[module]/actions";

/**
 * 对应 Excel B2「プロジェクト開始日」。计划开始日为手工日期，開始D+ = 计划开始日 − 项目开始日（自动计算）。
 * 修改开始日时可选择：只重算 D+，或把全部计划开始日同步平移（D+ 不变）。
 */
export function StartDateControl({ projectId, startDate, canManage }: { projectId: string; startDate: string | null; canManage: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(startDate ?? "");
  const [shift, setShift] = useState(false);
  const a = useAction();
  const dirty = v !== (startDate ?? "");
  const canShift = !!startDate && !!v;
  return (
    <div className="card mb-3 flex flex-wrap items-center gap-3 px-4 py-2.5">
      <CalendarClock size={15} className="text-brand-sage" />
      <span className="text-xs text-brand-mist">项目开始日 <span className="text-brand-sage">プロジェクト開始日</span></span>
      {canManage ? (
        <>
          <input type="date" className="input w-40 py-1 font-num text-xs [color-scheme:dark]" value={v} onChange={(e) => setV(e.target.value)} />
          {dirty && (
            <>
              {canShift && (
                <label className="flex cursor-pointer items-center gap-1.5 text-2xs text-brand-mist">
                  <input type="checkbox" className="accent-[#3F6E58]" checked={shift} onChange={(e) => setShift(e.target.checked)} />
                  同时平移全部计划开始日
                </label>
              )}
              <button className="btn-primary btn-sm" disabled={a.pending} onClick={() => a.exec(() => setFaStartDate(projectId, v || null, canShift && shift), () => router.refresh())}>
                应用
              </button>
            </>
          )}
        </>
      ) : (
        <span className="font-num text-sm text-brand-paper">{startDate ?? "未设置"}</span>
      )}
      <span className="text-2xs text-brand-sage">
        {startDate
          ? "计划开始日手工填写；開始D+ = 计划开始日 − 项目开始日，计划完成日 = 计划开始日 + 所要日数 − 1，均自动计算"
          : "未设置开始日时，開始D+ 无法计算（计划完成日与延迟天数不受影响）"}
      </span>
      <div className="w-full empty:hidden"><Alert>{a.error}</Alert></div>
    </div>
  );
}
