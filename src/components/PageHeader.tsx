import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, desc, actions }: { eyebrow?: string; title: ReactNode; desc?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="text-[22px] font-medium leading-tight text-brand-paper">{title}</h1>
        {desc && <p className="mt-1.5 text-sm text-brand-sage">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
