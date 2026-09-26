import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, users, projects } from "@/db/schema";
import { PageHeader } from "@/components/PageHeader";
import { fmtDateTime } from "@/lib/format";
import { actionLabel } from "./labels";

export const metadata = { title: "操作日志" };

export default async function LogsPage() {
  const rows = await db
    .select({ l: auditLogs, name: users.name, project: projects.name })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .leftJoin(projects, eq(projects.id, auditLogs.projectId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(500);
  return (
    <>
      <PageHeader eyebrow="Audit Log" title="操作日志" desc="后台管理动作记录（最近 500 条）。任务记录的逐条变更见各模块的「变更记录」。" />
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr><th className="th w-44">时间</th><th className="th w-32">操作人</th><th className="th w-40">动作</th><th className="th w-48">项目</th><th className="th">详情</th></tr>
          </thead>
          <tbody>
            {rows.map(({ l, name, project }) => (
              <tr key={l.id} className="hover:bg-ink-850/60">
                <td className="td font-num text-xs text-brand-sage">{fmtDateTime(l.createdAt)}</td>
                <td className="td">{name ?? "—"}</td>
                <td className="td">{actionLabel(l.action)}</td>
                <td className="td text-brand-sage">{project ?? "—"}</td>
                <td className="td max-w-[480px] truncate font-mono text-[11px] text-brand-sage">{JSON.stringify(l.detail)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
