import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, projects, apiKeys, auditLogs } from "@/db/schema";
import { PageHeader } from "@/components/PageHeader";
import { fmtDateTime } from "@/lib/format";
import { actionLabel } from "./logs/labels";

export const metadata = { title: "全局管理后台" };

export default async function AdminHome() {
  const [[u], [p], [k], logs] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int`, a: sql<number>`count(*) filter (where ${users.globalRole} = 'super_admin')::int` }).from(users),
    db.select({ n: sql<number>`count(*)::int`, a: sql<number>`count(*) filter (where ${projects.status} = 'active')::int` }).from(projects),
    db.select({ n: sql<number>`count(*)::int`, a: sql<number>`count(*) filter (where ${apiKeys.isActive})::int` }).from(apiKeys),
    db
      .select({ l: auditLogs, name: users.name })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(12),
  ]);
  const tiles = [
    { href: "/admin/users", label: "用户", value: u.n, sub: `其中全局管理员 ${u.a} 人` },
    { href: "/admin/projects", label: "项目", value: p.n, sub: `进行中 ${p.a} 个` },
    { href: "/admin/api-keys", label: "Agent API Key", value: k.n, sub: k.a ? `启用 ${k.a} 个` : "尚未配置，Agent 功能不可用" },
  ];
  return (
    <>
      <PageHeader eyebrow="Global Admin" title="全局管理后台" desc="管理全部用户、项目与 Agent 使用的 API Key" />
      <div className="grid gap-4 md:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="card p-5 transition hover:border-line-strong hover:bg-ink-850">
            <div className="eyebrow">{t.label}</div>
            <div className="mt-3 font-num text-[34px] font-medium leading-none text-brand-paper">{t.value}</div>
            <div className="mt-2 text-xs text-brand-sage">{t.sub}</div>
          </Link>
        ))}
      </div>
      <div className="card mt-6">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="text-sm font-medium text-brand-paper">最近操作</div>
          <Link href="/admin/logs" className="text-xs text-brand-sage hover:text-brand-paper">查看全部</Link>
        </div>
        <table className="w-full">
          <tbody>
            {logs.map(({ l, name }) => (
              <tr key={l.id}>
                <td className="td w-44 font-num text-xs text-brand-sage">{fmtDateTime(l.createdAt)}</td>
                <td className="td w-32">{name ?? "—"}</td>
                <td className="td">{actionLabel(l.action)}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td className="td text-center text-brand-sage" colSpan={3}>暂无记录</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
