"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard, ListChecks, FileSearch, Calculator, MessagesSquare, FolderLock, Settings2, ShieldCheck,
  Users, KeyRound, FolderKanban, ScrollText, LogOut, ChevronsUpDown, ArrowLeft, CircleUser, Check,
} from "lucide-react";
import { Logo } from "./Logo";
import { cn } from "./ui";
import { MODULES } from "@/lib/modules";
import { logoutAction } from "@/app/(auth)/actions";

const MODULE_ICON: Record<string, typeof LayoutDashboard> = {
  home: LayoutDashboard, fa: ListChecks, dd: FileSearch, fdd: Calculator, qa: MessagesSquare, vdr: FolderLock,
};

export type SidebarProps = {
  user: { name: string; email: string; globalRole: string };
  roleLabel: string;
  projects: { id: string; name: string; code: string }[];
  current?: { id: string; name: string; code: string; canManage: boolean; modules: string[] };
  mode: "project" | "admin" | "home";
};

function NavItem({ href, icon: Icon, label, tag, exact }: { href: string; icon: typeof LayoutDashboard; label: string; tag?: string; exact?: boolean }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] transition",
        active ? "bg-ink-700 text-brand-paper" : "text-brand-mist/75 hover:bg-ink-850 hover:text-brand-paper",
      )}
    >
      {active && <span className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-[2px] rounded bg-brand-sage" />}
      <Icon size={15} className={active ? "text-brand-mist" : "text-brand-sage"} />
      <span className="flex-1 truncate">{label}</span>
      {tag && <span className="rounded border border-line-strong px-1 text-[10px] leading-4 text-brand-sage">{tag}</span>}
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <div className="mb-1.5 px-2.5 text-[10px] font-medium uppercase tracking-[0.2em] text-brand-sage/70">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function ProjectSwitcher({ projects, current }: Pick<SidebarProps, "projects" | "current">) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-md border border-line bg-ink-850 px-2.5 py-2 text-left transition hover:border-line-strong"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-brand-green text-[11px] font-semibold text-brand-paper">
          {(current?.name ?? "P").slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] text-brand-paper">{current?.name ?? "选择项目"}</div>
          <div className="truncate text-[10px] tracking-wider text-brand-sage">{current?.code ?? `${projects.length} 个可访问项目`}</div>
        </div>
        <ChevronsUpDown size={14} className="text-brand-sage" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-md border border-line-strong bg-ink-850 p-1 shadow-panel">
          {projects.length === 0 && <div className="px-2.5 py-2 text-xs text-brand-sage">暂无可访问项目</div>}
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setOpen(false);
                router.push(`/p/${p.id}`);
              }}
              className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[13px] text-brand-mist hover:bg-ink-700"
            >
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-[10px] text-brand-sage">{p.code}</span>
              {current?.id === p.id && <Check size={13} className="text-brand-sage" />}
            </button>
          ))}
          <div className="my-1 h-px bg-line" />
          <Link href="/" onClick={() => setOpen(false)} className="block rounded px-2.5 py-1.5 text-xs text-brand-sage hover:bg-ink-700 hover:text-brand-paper">
            全部项目
          </Link>
        </div>
      )}
    </div>
  );
}

export function Sidebar({ user, roleLabel, projects, current, mode }: SidebarProps) {
  const isSuper = user.globalRole === "super_admin";
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-[248px] flex-col border-r border-line bg-ink-900">
      <div className="flex h-[60px] items-center justify-between border-b border-line px-5">
        <Link href="/" aria-label="首页">
          <Logo variant="white" height={26} />
        </Link>
        <span className="text-[10px] font-semibold tracking-[0.22em] text-brand-sage">FA MASTER</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {mode === "admin" ? (
          <>
            <Link href="/" className="mb-2 flex items-center gap-2 px-2.5 py-1.5 text-xs text-brand-sage hover:text-brand-paper">
              <ArrowLeft size={13} /> 返回工作台
            </Link>
            <Section title="全局管理后台">
              <NavItem href="/admin" icon={ShieldCheck} label="概览" exact />
              <NavItem href="/admin/users" icon={Users} label="用户管理" />
              <NavItem href="/admin/projects" icon={FolderKanban} label="项目管理" />
              <NavItem href="/admin/api-keys" icon={KeyRound} label="Agent API Key" />
              <NavItem href="/admin/logs" icon={ScrollText} label="操作日志" />
            </Section>
          </>
        ) : (
          <>
            <ProjectSwitcher projects={projects} current={current} />
            {current ? (
              <>
                <Section title="业务模块">
                  {MODULES.filter((m) => current.modules.includes(m.key)).map((m) => (
                    <NavItem
                      key={m.key}
                      href={m.key === "home" ? `/p/${current.id}` : `/p/${current.id}/${m.key}`}
                      exact={m.key === "home"}
                      icon={MODULE_ICON[m.key]}
                      label={m.label}
                      tag={m.ready ? undefined : "规划中"}
                    />
                  ))}
                  {current.modules.length === 0 && <div className="px-2.5 py-1 text-xs text-brand-sage">本项目未启用任何模块</div>}
                </Section>
                {current.canManage && (
                  <Section title="管理">
                    <NavItem href={`/p/${current.id}/settings`} icon={Settings2} label="项目管理" />
                  </Section>
                )}
              </>
            ) : (
              <Section title="工作台">
                <NavItem href="/" icon={FolderKanban} label="我的项目" exact />
              </Section>
            )}
            {isSuper && (
              <Section title="系统">
                <NavItem href="/admin" icon={ShieldCheck} label="全局管理后台" />
              </Section>
            )}
          </>
        )}
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
          <Link href="/account" className="flex min-w-0 flex-1 items-center gap-2.5" title="账号设置">
            <CircleUser size={26} strokeWidth={1.2} className="shrink-0 text-brand-sage" />
            <div className="min-w-0">
              <div className="truncate text-[13px] text-brand-paper">{user.name}</div>
              <div className="truncate text-[10px] text-brand-sage">{roleLabel}</div>
            </div>
          </Link>
          <form action={logoutAction}>
            <button className="rounded p-1.5 text-brand-sage hover:bg-ink-700 hover:text-brand-paper" title="退出登录">
              <LogOut size={15} />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
