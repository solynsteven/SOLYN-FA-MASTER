import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireProject } from "@/lib/auth";
import { moduleDef, type TrackerModuleKey } from "@/lib/modules";
import { listFields } from "@/lib/queries";
import { moduleHistory } from "@/lib/tracker";
import { qaViewer, accessKey, canSee } from "@/lib/qa/access";
import { PageHeader } from "@/components/PageHeader";
import { QaNoAccess } from "@/components/qa/QaTabs";
import { HistoryClient } from "@/app/p/[projectId]/[module]/history/HistoryClient";

export async function HistoryPage({ projectId, moduleKey }: { projectId: string; moduleKey: TrackerModuleKey }) {
  const mod = moduleDef(moduleKey)!;
  const { project, canManage } = await requireProject(projectId, { module: moduleKey });
  const viewer = moduleKey === "qa" ? await qaViewer(projectId) : null;
  if (viewer && viewer.rank === 0) return <QaNoAccess />;
  const [rows0, fields] = await Promise.all([moduleHistory(projectId, moduleKey, 1000), listFields(projectId, moduleKey)]);
  // Q&A：只显示当前权限组可见的记录的变更（按变更时的快照判断）
  const ak = accessKey(fields);
  const rows = viewer && !viewer.isManager ? rows0.filter(({ c }) => canSee(viewer.rank, c.snapshot?.[ak])) : rows0;
  const titleKey = fields.find((f) => f.role === "title")?.key;
  const codeKey = fields.find((f) => f.role === "code")?.key;
  return (
    <>
      <Link href={`/p/${projectId}/${moduleKey}`} className="mb-3 inline-flex items-center gap-1.5 text-xs text-brand-sage hover:text-brand-paper">
        <ArrowLeft size={13} />返回{mod.label}
      </Link>
      <PageHeader eyebrow={`${project.code} · ${mod.en} · Change Log`} title={`${mod.label} · 变更记录`} desc="全部新增、修改、删除与恢复操作的时间线（最近 1000 条）。已删除记录可由管理员恢复。" />
      <HistoryClient
        projectId={projectId}
        moduleKey={moduleKey}
        canManage={canManage}
        fields={fields.map((f) => ({ key: f.key, label: f.label, type: f.type }))}
        rows={rows.map(({ c, actor, seq, deletedAt }) => ({
          id: c.id, itemId: c.itemId, action: c.action, source: c.source, changes: c.changes, actor: actor ?? "—", at: c.createdAt.toISOString(),
          seq: seq ?? null, isDeleted: !!deletedAt,
          title: String((titleKey && c.snapshot?.[titleKey]) || ""), code: String((codeKey && c.snapshot?.[codeKey]) || ""),
        }))}
      />
    </>
  );
}
