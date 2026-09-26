import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireProject } from "@/lib/auth";
import { moduleDef, type TrackerModuleKey } from "@/lib/modules";
import { listFields, listProjectMembers } from "@/lib/queries";
import { listItemsDerived } from "@/lib/tracker";
import { seedDefaultFields } from "@/lib/project-service";
import { qaViewer, filterQa } from "@/lib/qa/access";
import { PageHeader } from "@/components/PageHeader";
import { TrackerClient } from "@/components/tracker/TrackerClient";
import { QaTabs, QaNoAccess } from "@/components/qa/QaTabs";

const META: Record<TrackerModuleKey, { title: string; desc: string; item: string }> = {
  fa: { title: "FA 项目管理", desc: "交易任务计划与进度跟踪。每条任务的新增、修改与删除都会自动记录日期。", item: "任务" },
  dd: { title: "DD 管理", desc: "尽调材料与信息收集进度跟踪。每条记录的变更（含删除）都会自动记录日期。", item: "材料" },
  qa: { title: "Q&A 问答跟踪", desc: "Q&A 与访谈中的重要问题及答复跟踪。记录按权限组逐级开放：ADM > SEL > EXC > DD。", item: "问题" },
};

/** FA / DD / Q&A 通用跟踪表页面（服务端） */
export async function TrackerPage({ projectId, moduleKey }: { projectId: string; moduleKey: TrackerModuleKey }) {
  const mod = moduleDef(moduleKey)!;
  const { project, canManage } = await requireProject(projectId, { module: moduleKey });
  const m = META[moduleKey];
  const viewer = moduleKey === "qa" ? await qaViewer(projectId) : null;
  if (moduleKey === "qa" && (!viewer || viewer.rank === 0)) {
    return (
      <>
        <PageHeader eyebrow={`${project.code} · ${mod.en}`} title={mod.label} />
        <QaNoAccess />
      </>
    );
  }
  await seedDefaultFields(projectId, moduleKey);
  const fields = await listFields(projectId, moduleKey);
  const [{ items: all, ctx }, members] = await Promise.all([listItemsDerived(projectId, moduleKey, fields), listProjectMembers(projectId)]);
  const items = viewer ? filterQa(all, fields, viewer.rank) : all;
  const updaterIds = [...new Set(items.map((i) => i.updatedBy).filter(Boolean))] as string[];
  const updaters = updaterIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, updaterIds)) : [];
  const uname = new Map(updaters.map((u) => [u.id, u.name]));

  return (
    <>
      <PageHeader
        eyebrow={`${project.code} · ${mod.en}`}
        title={m.title}
        desc={viewer && !viewer.isManager ? `${m.desc} 你的权限组：${viewer.group}，可见 ${items.length} 条。` : m.desc}
      />
      {moduleKey === "qa" && <QaTabs projectId={projectId} active="tracker" />}
      <TrackerClient
        projectId={projectId}
        moduleKey={moduleKey}
        moduleLabel={mod.label}
        itemLabel={m.item}
        canManage={canManage}
        today={ctx.today}
        fields={fields.map((f) => ({ id: f.id, key: f.key, label: f.label, type: f.type, options: f.options, role: f.role, required: f.required, showInTable: f.showInTable, width: f.width, formula: f.formula, config: f.config }))}
        startDate={ctx.startDate}
        items={items.map((i) => ({
          id: i.id, seq: i.seq, data: i.data, fieldUpdatedAt: i.fieldUpdatedAt, createdAt: i.createdAt.toISOString(), updatedAt: i.updatedAt.toISOString(),
          updatedByName: i.updatedBy ? uname.get(i.updatedBy) ?? null : null,
        }))}
        members={members.map((x) => ({ id: x.userId, name: x.name }))}
      />
    </>
  );
}
