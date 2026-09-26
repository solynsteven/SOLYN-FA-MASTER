import Link from "next/link";
import { FolderKanban, Users, ListChecks, FileSearch, ChevronRight } from "lucide-react";
import { requireUser, ROLE_LABEL } from "@/lib/auth";
import { listAccessibleProjects, projectStats } from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui";
import { MODULES } from "@/lib/modules";

export const metadata = { title: "我的项目" };

const STATUS: Record<string, string> = { active: "进行中", on_hold: "暂停", closed: "已关闭" };

export default async function HomePage() {
  const user = await requireUser();
  const projects = await listAccessibleProjects(user);
  const stats = await projectStats(projects.map((p) => p.id));
  const isSuper = user.globalRole === "super_admin";

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title={`${user.name}，您好`}
        desc={projects.length ? `您可访问 ${projects.length} 个项目` : undefined}
        actions={isSuper && <Link href="/admin/projects" className="btn-primary">新建 / 管理项目</Link>}
      />
      {projects.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<FolderKanban size={28} strokeWidth={1.3} />}
            title="暂无可访问的项目"
            desc={isSuper ? "您是全局管理员，可在全局管理后台创建第一个项目。" : "请联系项目管理员将您加入项目。"}
            action={isSuper && <Link href="/admin/projects" className="btn-primary">前往创建项目</Link>}
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const s = stats.get(p.id)!;
            return (
              <Link key={p.id} href={`/p/${p.id}`} className="card group flex flex-col p-5 transition hover:border-line-strong hover:bg-ink-850">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-2xs tracking-[0.18em] text-brand-sage">{p.code}</div>
                    <div className="mt-1 truncate text-[16px] font-medium text-brand-paper">{p.name}</div>
                    {p.clientName && <div className="mt-0.5 truncate text-xs text-brand-sage">{p.clientName}</div>}
                  </div>
                  <span className="shrink-0 rounded border border-line-strong px-1.5 py-0.5 text-2xs text-brand-mist">{STATUS[p.status]}</span>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4 text-xs">
                  <div className="flex items-center gap-1.5 text-brand-sage"><Users size={13} /><span className="font-num text-brand-mist">{s.members}</span> 成员</div>
                  <div className="flex items-center gap-1.5 text-brand-sage"><ListChecks size={13} /><span className="font-num text-brand-mist">{s.fa}</span> 任务</div>
                  <div className="flex items-center gap-1.5 text-brand-sage"><FileSearch size={13} /><span className="font-num text-brand-mist">{s.dd}</span> DD</div>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex flex-wrap gap-1">
                    {MODULES.filter((m) => s.modules.includes(m.key)).map((m) => (
                      <span key={m.key} className="rounded bg-ink-700 px-1.5 py-0.5 text-[10px] text-brand-mist/80">{m.label}</span>
                    ))}
                  </div>
                  <span className="flex items-center gap-1 text-2xs text-brand-sage">
                    {ROLE_LABEL[p.myRole]} <ChevronRight size={13} className="transition group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
