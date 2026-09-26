import Link from "next/link";
import { ListChecks, Library, Sparkles, ShieldOff } from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { k: "tracker", href: "", label: "问答跟踪", icon: ListChecks },
  { k: "kb", href: "/kb", label: "项目知识库", icon: Library },
  { k: "ai", href: "/ai", label: "AI 智能问答", icon: Sparkles },
] as const;

export function QaTabs({ projectId, active }: { projectId: string; active: (typeof TABS)[number]["k"] }) {
  return (
    <div className="mb-5 flex gap-1 border-b border-line">
      {TABS.map((t) => (
        <Link
          key={t.k}
          href={`/p/${projectId}/qa${t.href}`}
          className={cn(
            "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2 text-[13px] transition",
            active === t.k ? "border-brand-sage text-brand-paper" : "border-transparent text-brand-sage hover:text-brand-mist",
          )}
        >
          <t.icon size={14} />
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function QaNoAccess() {
  return (
    <div className="card flex flex-col items-center px-6 py-16 text-center">
      <ShieldOff size={28} strokeWidth={1.3} className="mb-3 text-brand-sage" />
      <div className="text-sm font-medium text-brand-paper">你暂时没有 Q&A 模块的访问权限</div>
      <div className="mt-1.5 max-w-md text-xs leading-relaxed text-brand-sage">
        Q&A 记录、项目知识库与 AI 智能问答按权限组 ADM / SEL / EXC / DD 开放。请联系项目管理员在「项目管理 → 成员与权限」中为你设置权限组。
      </div>
    </div>
  );
}
