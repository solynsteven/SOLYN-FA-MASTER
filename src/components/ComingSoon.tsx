import { Hammer } from "lucide-react";
import type { ModuleDef } from "@/lib/modules";

export function ComingSoon({ mod, extra }: { mod: ModuleDef; extra?: React.ReactNode }) {
  return (
    <div className="card relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 bg-brand-green/10" />
      <div aria-hidden className="pointer-events-none absolute right-[52px] top-[38px] h-48 w-48 bg-brand-green/[0.07]" />
      <div className="relative px-8 py-14">
        <div className="flex h-11 w-11 items-center justify-center rounded-md border border-line-strong bg-ink-850 text-brand-sage">
          <Hammer size={20} strokeWidth={1.4} />
        </div>
        <div className="eyebrow mt-6">{mod.en} · 规划中</div>
        <h2 className="mt-2 text-xl font-medium text-brand-paper">{mod.label}模块正在开发中</h2>
        <p className="mt-2 max-w-xl text-sm leading-7 text-brand-sage">
          {mod.desc}。该模块已纳入平台规划，当前版本优先上线「FA 项目管理」与「DD 管理」。上线后，项目管理员可在「项目管理 → 模块」中启用，无需重新创建项目。
        </p>
        {extra}
      </div>
    </div>
  );
}
