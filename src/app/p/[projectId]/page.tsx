import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { requireProject, ROLE_LABEL } from "@/lib/auth";
import { MODULES, moduleDef } from "@/lib/modules";
import { listFields, listProjectMembers } from "@/lib/queries";
import { listItemsDerived } from "@/lib/tracker";
import { trackerSummary } from "@/lib/tracker-stats";
import { todayISO, fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata = { title: "项目首页" };

export default async function ProjectHome({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project, role, enabledModules } = await requireProject(projectId);
  if (!enabledModules.has("home")) {
    const first = MODULES.find((m) => enabledModules.has(m.key));
    if (first) redirect(`/p/${projectId}/${first.key}`);
  }
  const today = todayISO();
  const trackers = await Promise.all(
    (["fa", "dd"] as const)
      .filter((k) => enabledModules.has(k))
      .map(async (k) => {
        const fields = await listFields(projectId, k);
        const { items } = await listItemsDerived(projectId, k, fields);
        return { k, s: trackerSummary(fields, items, today) };
      }),
  );
  const members = await listProjectMembers(projectId);

  return (
    <>
      <PageHeader
        eyebrow={`${project.code}${project.dealType ? ` · ${project.dealType}` : ""}`}
        title={project.name}
        desc={[project.clientName, `我的角色：${ROLE_LABEL[role]}`, `创建于 ${fmtDate(project.createdAt)}`].filter(Boolean).join("　·　")}
      />
      {trackers.length > 0 && (
        <div className="mb-5 grid gap-4 md:grid-cols-2">
          {trackers.map(({ k, s }) => (
            <Link key={k} href={`/p/${projectId}/${k}`} className="card group p-5 transition hover:border-line-strong hover:bg-ink-850">
              <div className="flex items-center justify-between">
                <div className="eyebrow">{moduleDef(k)!.label}</div>
                <ChevronRight size={14} className="text-brand-sage transition group-hover:translate-x-0.5" />
              </div>
              <div className="mt-4 flex items-end gap-8">
                <div>
                  <div className="font-num text-[34px] font-medium leading-none text-brand-paper">{s.rate}<span className="ml-0.5 text-base text-brand-sage">%</span></div>
                  <div className="mt-1.5 text-2xs text-brand-sage">完成率</div>
                </div>
                <Stat v={s.total} l="总数" />
                <Stat v={s.done} l="已完成" />
                <Stat v={s.overdue} l="逾期" danger={s.overdue > 0} />
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-ink-700">
                <div className="h-full rounded-full bg-brand-mid" style={{ width: `${s.rate}%` }} />
              </div>
            </Link>
          ))}
        </div>
      )}
      <div className="mb-5 card p-5">
        <div className="eyebrow mb-3">项目成员 · {members.length}</div>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <span key={m.userId} className="rounded-md border border-line bg-ink-850 px-2.5 py-1 text-xs text-brand-mist">
              {m.name}{m.role === "project_admin" && <span className="ml-1.5 text-brand-sage">管理员</span>}
            </span>
          ))}
          {members.length === 0 && <span className="text-xs text-brand-sage">尚未添加成员</span>}
        </div>
      </div>
      <ComingSoon mod={moduleDef("home")!} />
    </>
  );
}

function Stat({ v, l, danger }: { v: number; l: string; danger?: boolean }) {
  return (
    <div>
      <div className={`font-num text-xl leading-none ${danger ? "text-danger" : "text-brand-mist"}`}>{v}</div>
      <div className="mt-1.5 text-2xs text-brand-sage">{l}</div>
    </div>
  );
}
