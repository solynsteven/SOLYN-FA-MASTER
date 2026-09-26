import { redirect } from "next/navigation";
import { requireProject, ROLE_LABEL } from "@/lib/auth";
import { MODULES } from "@/lib/modules";
import { listFields, listProjectMembers } from "@/lib/queries";
import { listItemsDerived } from "@/lib/tracker";
import { buildFaDashboard, buildDdDashboard } from "@/lib/dashboard";
import { fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { FaDashboard, DdDashboard } from "@/components/dashboard/Dashboards";
import { EmptyState } from "@/components/ui";

export const metadata = { title: "项目首页" };

export default async function ProjectHome({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project, role, enabledModules } = await requireProject(projectId);
  if (!enabledModules.has("home")) {
    const first = MODULES.find((m) => enabledModules.has(m.key));
    if (first) redirect(`/p/${projectId}/${first.key}`);
  }
  const load = async (k: "fa" | "dd") => {
    const fields = await listFields(projectId, k);
    const { items, ctx } = await listItemsDerived(projectId, k, fields);
    return { fields, items, ctx };
  };
  const [fa, dd, members] = await Promise.all([
    enabledModules.has("fa") ? load("fa") : null,
    enabledModules.has("dd") ? load("dd") : null,
    listProjectMembers(projectId),
  ]);
  const today = fa?.ctx.today ?? dd?.ctx.today ?? "";

  return (
    <>
      <PageHeader
        eyebrow={`${project.code}${project.dealType ? ` · ${project.dealType}` : ""} · Overview`}
        title={project.name}
        desc={[project.clientName, `我的角色：${ROLE_LABEL[role]}`, fa?.ctx.startDate ? `项目开始日 ${fa.ctx.startDate}` : `创建于 ${fmtDate(project.createdAt)}`, `统计日 ${today}`].filter(Boolean).join("　·　")}
        actions={
          <div className="flex -space-x-1.5">
            {members.slice(0, 8).map((m) => (
              <span key={m.userId} title={`${m.name}${m.role === "project_admin" ? "（管理员）" : ""}`} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink-950 bg-ink-700 text-[11px] text-brand-mist">
                {m.name.slice(0, 1)}
              </span>
            ))}
            {members.length > 8 && <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink-950 bg-ink-800 text-[10px] text-brand-sage">+{members.length - 8}</span>}
          </div>
        }
      />
      <div className="space-y-10">
        {fa && <FaDashboard d={buildFaDashboard(fa.fields, fa.items, today)} href={`/p/${projectId}/fa`} />}
        {dd && <DdDashboard d={buildDdDashboard(dd.fields, dd.items)} href={`/p/${projectId}/dd`} />}
        {!fa && !dd && (
          <div className="card">
            <EmptyState title="本项目未启用 FA 项目管理或 DD 管理" desc="在「项目管理 → 业务模块」中启用后，这里会显示对应的 Dashboard。" />
          </div>
        )}
      </div>
    </>
  );
}
