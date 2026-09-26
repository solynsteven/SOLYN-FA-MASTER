"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Toggle, useAction } from "@/components/ui";
import { MODULES } from "@/lib/modules";
import { updateProjectInfo, setProjectModules } from "./actions";

export function InfoTab({ projectId, p }: { projectId: string; p: { code: string; name: string; clientName: string; dealType: string; description: string } }) {
  const router = useRouter();
  const [f, setF] = useState(p);
  const a = useAction();
  return (
    <div className="card max-w-2xl space-y-4 p-5">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">项目代号（不可修改）</label><input className="input font-num" value={f.code} disabled /></div>
        <div><label className="label">项目名称</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label className="label">委托方 / 客户</label><input className="input" value={f.clientName} onChange={(e) => setF({ ...f, clientName: e.target.value })} /></div>
        <div><label className="label">交易类型</label><input className="input" value={f.dealType} onChange={(e) => setF({ ...f, dealType: e.target.value })} /></div>
        <div className="col-span-2"><label className="label">项目简介</label><textarea className="input min-h-[96px]" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      </div>
      <Alert>{a.error}</Alert>
      <Alert kind="success">{a.message}</Alert>
      <button className="btn-primary" disabled={a.pending} onClick={() => a.exec(() => updateProjectInfo(projectId, f), () => router.refresh())}>保存</button>
    </div>
  );
}

export function ModulesTab({ projectId, enabled: e0 }: { projectId: string; enabled: string[] }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(e0);
  const a = useAction();
  return (
    <div className="max-w-3xl space-y-4">
      <div className="card divide-y divide-line">
        {MODULES.map((m) => (
          <div key={m.key} className="flex items-center gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm text-brand-paper">
                {m.label}
                <span className="text-2xs text-brand-sage">{m.en}</span>
                {!m.ready && <span className="rounded border border-line-strong px-1 text-[10px] text-brand-sage">规划中</span>}
              </div>
              <div className="mt-0.5 text-xs text-brand-sage">{m.desc}</div>
            </div>
            <Toggle checked={enabled.includes(m.key)} onChange={(v) => setEnabled(v ? [...enabled, m.key] : enabled.filter((x) => x !== m.key))} />
          </div>
        ))}
      </div>
      <p className="text-2xs text-brand-sage">关闭模块只会在导航中隐藏，模块内的数据不会被删除，重新开启即可恢复。</p>
      <Alert>{a.error}</Alert>
      <Alert kind="success">{a.message}</Alert>
      <button className="btn-primary" disabled={a.pending} onClick={() => a.exec(() => setProjectModules(projectId, enabled), () => router.refresh())}>保存模块设置</button>
    </div>
  );
}
