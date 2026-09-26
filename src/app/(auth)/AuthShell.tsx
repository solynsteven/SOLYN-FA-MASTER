import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";

/** 登录页：左侧 Deep Pine 深色底 + 反白 Logo；右侧 Paper 暖白底 + 标准版深色 Logo */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
      <section className="relative hidden overflow-hidden bg-brand-pine lg:flex lg:flex-col lg:justify-between lg:p-14">
        {/* 品牌母题：两块方块交叠（背景装饰，按手册比例：横向错位 0.64a、纵向错位 0.25a） */}
        <div aria-hidden className="pointer-events-none absolute right-[-180px] top-[16%] h-[500px] w-[656px]">
          <div className="absolute left-0 top-0 h-[400px] w-[400px] bg-[#1F4537]/70" />
          <div className="absolute left-[256px] top-[100px] h-[400px] w-[400px] bg-[#1F4537]/45" />
          <div className="absolute left-[256px] top-[100px] h-[300px] w-[144px] bg-[#12301F]/40" />
        </div>
        <div className="relative"><Logo variant="white" height={44} /></div>
        <div className="relative max-w-md">
          <div className="eyebrow mb-4 text-brand-sage">M&amp;A · Capital Advisory</div>
          <h1 className="text-[40px] font-semibold leading-[1.15] tracking-[0.04em] text-brand-paper">
            SOLYN
            <br />
            FA MASTER
          </h1>
          <div className="mt-5 h-px w-16 bg-brand-sage/50" />
          <p className="mt-5 text-sm leading-7 text-brand-mist/80">
            投融资并购财务顾问工作平台。交易进度、尽调材料、问答与数据室，在一个地方被管理、被追溯。
          </p>
        </div>
        <div className="relative text-2xs tracking-[0.2em] text-brand-sage/70">SOLYN ADVISORY · 商业机密 · 仅限授权人员使用</div>
      </section>
      <section className="flex items-center justify-center bg-brand-paper px-6 py-12 text-ink-950">
        <div className="w-full max-w-[360px]">
          <div className="mb-10">
            <Logo variant="dark" height={40} />
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}

export const lightInput =
  "w-full rounded-md border border-[#D7E0DA] bg-white px-3 py-2.5 text-sm text-[#16362A] outline-none transition placeholder:text-[#7C9A8B] focus:border-[#3F6E58] focus:ring-2 focus:ring-[#3F6E58]/20";
