import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireProject } from "@/lib/auth";
import { moduleDef, isTrackerModule } from "@/lib/modules";
import { listFields } from "@/lib/queries";
import { moduleHistory } from "@/lib/tracker";
import { PageHeader } from "@/components/PageHeader";
import { HistoryClient } from "./HistoryClient";

export const metadata = { title: "变更记录" };

export default async function HistoryPage({ params }: { params: Promise<{ projectId: string; module: string }> }) {
  const { projectId, module } = await params;
  const mod = moduleDef(module);
  if (!mod || !isTrackerModule(mod.key)) notFound();
  const { project, canManage } = await requireProject(projectId, { module: mod.key });
  const [rows, fields] = await Promise.all([moduleHistory(projectId, mod.key, 1000), listFields(projectId, mod.key)]);
  const titleKey = fields.find((f) => f.role === "title")?.key;
  const codeKey = fields.find((f) => f.role === "code")?.key;
  return (
    <>
      <Link href={`/p/${projectId}/${mod.key}`} className="mb-3 inline-flex items-center gap-1.5 text-xs text-brand-sage hover:text-brand-paper">
        <ArrowLeft size={13} />返回{mod.label}
      </Link>
      <PageHeader eyebrow={`${project.code} · ${mod.en} · Change Log`} title={`${mod.label} · 变更记录`} desc="全部新增、修改、删除与恢复操作的时间线（最近 1000 条）。已删除记录可由管理员恢复。" />
      <HistoryClient
        projectId={projectId}
        moduleKey={mod.key}
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
