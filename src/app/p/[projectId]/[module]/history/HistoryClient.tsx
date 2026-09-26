"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Alert, Badge, cn, useAction } from "@/components/ui";
import { displayValue } from "@/lib/fields";
import { fmtDateTime } from "@/lib/format";
import { restoreItemAction } from "../actions";

type R = {
  id: string; itemId: string; action: string; source: string; changes: Record<string, { from: unknown; to: unknown }>;
  actor: string; at: string; seq: number | null; isDeleted: boolean; title: string; code: string;
};
const ACTION: Record<string, { l: string; t: "mid" | "danger" | "outline" | "green" }> = {
  create: { l: "新增", t: "green" }, update: { l: "修改", t: "mid" }, delete: { l: "删除", t: "danger" }, restore: { l: "恢复", t: "outline" },
};

export function HistoryClient({ projectId, moduleKey, canManage, fields, rows }: {
  projectId: string; moduleKey: string; canManage: boolean; fields: { key: string; label: string; type: string }[]; rows: R[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("");
  const a = useAction();
  const list = rows.filter((r) => !filter || r.action === filter);
  const label = (k: string) => fields.find((f) => f.key === k)?.label ?? k;
  const type = (k: string) => fields.find((f) => f.key === k)?.type ?? "text";
  return (
    <div className="card">
      <div className="flex items-center gap-1 border-b border-line p-3">
        {[["", "全部"], ["create", "新增"], ["update", "修改"], ["delete", "删除"], ["restore", "恢复"]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={cn("rounded px-2.5 py-1 text-xs transition", filter === k ? "bg-ink-700 text-brand-paper" : "text-brand-sage hover:text-brand-mist")}>
            {l}<span className="ml-1 font-num text-brand-sage/70">{k ? rows.filter((r) => r.action === k).length : rows.length}</span>
          </button>
        ))}
      </div>
      <Alert>{a.error}</Alert>
      <table className="w-full">
        <thead>
          <tr><th className="th w-40">变更日期</th><th className="th w-20">动作</th><th className="th w-64">记录</th><th className="th">变更内容</th><th className="th w-28">操作人</th><th className="th w-24" /></tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id} className="hover:bg-ink-850/60">
              <td className="td whitespace-nowrap font-num text-xs text-brand-sage">{fmtDateTime(r.at)}</td>
              <td className="td"><Badge tone={ACTION[r.action]?.t ?? "outline"}>{ACTION[r.action]?.l ?? r.action}</Badge>{r.source === "import" && <div className="mt-1 text-[10px] text-brand-sage">Excel 导入</div>}</td>
              <td className="td">
                <div className="text-brand-paper">{r.title || "—"}</div>
                <div className="text-2xs text-brand-sage">{r.code && `${r.code} · `}#{r.seq ?? "?"}{r.isDeleted && " · 当前已删除"}</div>
              </td>
              <td className="td text-xs">
                {r.action === "update" ? (
                  <div className="space-y-0.5">
                    {Object.entries(r.changes).map(([k, c]) => (
                      <div key={k}>
                        <span className="text-brand-sage">{label(k)}：</span>
                        <span className="text-brand-sage/70 line-through decoration-brand-sage/40">{displayValue(type(k), c.from) || "（空）"}</span>
                        <span className="mx-1 text-brand-sage">→</span>
                        <span className="text-brand-mist">{displayValue(type(k), c.to) || "（空）"}</span>
                      </div>
                    ))}
                  </div>
                ) : r.action === "create" ? (
                  <span className="text-brand-sage">新建记录，填写 {Object.keys(r.changes).length} 个字段</span>
                ) : r.action === "delete" ? (
                  <span className="text-brand-sage">记录被删除（删除时内容已存档）</span>
                ) : (
                  <span className="text-brand-sage">记录被恢复</span>
                )}
              </td>
              <td className="td">{r.actor}</td>
              <td className="td text-right">
                {canManage && r.action === "delete" && r.isDeleted && (
                  <button className="btn-secondary btn-sm" disabled={a.pending} onClick={() => a.exec(() => restoreItemAction(projectId, moduleKey, r.itemId), () => router.refresh())}>
                    <RotateCcw size={12} />恢复
                  </button>
                )}
              </td>
            </tr>
          ))}
          {list.length === 0 && <tr><td colSpan={6} className="td py-12 text-center text-brand-sage">暂无变更记录</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
