"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { Alert, useAction } from "@/components/ui";
import { setFaStartDate } from "@/app/p/[projectId]/[module]/actions";

/** 对应 Excel B2「プロジェクト開始日」：修改后全部计划日期自动平移 */
export function StartDateControl({ projectId, startDate, canManage }: { projectId: string; startDate: string | null; canManage: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(startDate ?? "");
  const a = useAction();
  const dirty = v !== (startDate ?? "");
  return (
    <div className="card mb-3 flex flex-wrap items-center gap-3 px-4 py-2.5">
      <CalendarClock size={15} className="text-brand-sage" />
      <span className="text-xs text-brand-mist">项目开始日 <span className="text-brand-sage">プロジェクト開始日</span></span>
      {canManage ? (
        <>
          <input type="date" className="input w-40 py-1 font-num text-xs [color-scheme:dark]" value={v} onChange={(e) => setV(e.target.value)} />
          {dirty && (
            <button className="btn-primary btn-sm" disabled={a.pending} onClick={() => a.exec(() => setFaStartDate(projectId, v || null), () => router.refresh())}>
              应用并平移计划日期
            </button>
          )}
        </>
      ) : (
        <span className="font-num text-sm text-brand-paper">{startDate ?? "未设置"}</span>
      )}
      <span className="text-2xs text-brand-sage">
        {startDate ? "计划开始 / 完成日 = 开始日 + 開始D+ / 所要日数，自动计算；延迟天数按今天实时计算" : "未设置开始日时，计划日期与延迟天数无法计算"}
      </span>
      <div className="w-full empty:hidden"><Alert>{a.error}</Alert></div>
    </div>
  );
}
