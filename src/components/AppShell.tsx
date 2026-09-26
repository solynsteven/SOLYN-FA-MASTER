import type { ReactNode } from "react";
import { Sidebar, type SidebarProps } from "./Sidebar";

export function AppShell({ sidebar, children }: { sidebar: SidebarProps; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-950">
      <Sidebar {...sidebar} />
      <main className="pl-[248px]">
        <div className="mx-auto max-w-[1680px] px-8 py-7">{children}</div>
      </main>
    </div>
  );
}
