import { notFound } from "next/navigation";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireProject } from "@/lib/auth";
import { moduleDef, isTrackerModule, type ModuleKey } from "@/lib/modules";
import { listFields, listProjectMembers } from "@/lib/queries";
import { listItemsDerived } from "@/lib/tracker";
import { PageHeader } from "@/components/PageHeader";
import { ComingSoon } from "@/components/ComingSoon";
import { TrackerClient } from "@/components/tracker/TrackerClient";

export const maxDuration = 60; // Excel 导入需要较长执行时间

const META: Record<"fa" | "dd", { title: string; desc: string; item: string }> = {
  fa: { title: "FA 项目管理", desc: "交易任务计划与进度跟踪。每条任务的新增、修改与删除都会自动记录日期。", item: "任务" },
  dd: { title: "DD 管理", desc: "尽调材料与信息收集进度跟踪。每条记录的变更（含删除）都会自动记录日期。", item: "材料" },
};

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  return { title: moduleDef(module)?.label ?? "模块" };
}

export default async function ModulePage({ params }: { params: Promise<{ projectId: string; module: string }> }) {
  const { projectId, module } = await params;
  const mod = moduleDef(module);
  if (!mod || mod.key === "home") notFound();
  const { project, canManage } = await requireProject(projectId, { module: mod.key as ModuleKey });

  if (!isTrackerModule(mod.key)) {
    return (
      <>
        <PageHeader eyebrow={`${project.code} · ${mod.en}`} title={mod.label} />
        <ComingSoon mod={mod} />
      </>
    );
  }

  const fields = await listFields(projectId, mod.key);
  const [{ items, ctx }, members] = await Promise.all([listItemsDerived(projectId, mod.key, fields), listProjectMembers(projectId)]);
  const updaterIds = [...new Set(items.map((i) => i.updatedBy).filter(Boolean))] as string[];
  const updaters = updaterIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, updaterIds)) : [];
  const uname = new Map(updaters.map((u) => [u.id, u.name]));
  const m = META[mod.key];

  return (
    <>
      <PageHeader eyebrow={`${project.code} · ${mod.en}`} title={m.title} desc={m.desc} />
      <TrackerClient
        projectId={projectId}
        moduleKey={mod.key}
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
