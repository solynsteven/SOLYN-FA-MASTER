import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { projectModules, users } from "@/db/schema";
import { loadVdr } from "@/lib/vdr/access";
import { VdrBinTab, type BinRow } from "./VdrBinTab";
import { requireProject } from "@/lib/auth";
import { listFields, listProjectMembers, countItems } from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import { cn } from "@/lib/cn";
import { InfoTab, ModulesTab } from "./InfoTabs";
import { MembersTab } from "./MembersTab";
import { FieldsTabKeyed as FieldsTab } from "./FieldsTab";

export const metadata = { title: "项目管理" };

const TABS = [
  { k: "members", l: "成员与权限" },
  { k: "fa", l: "FA 任务字段" },
  { k: "dd", l: "DD 任务字段" },
  { k: "vdr-bin", l: "VDR 回收站" },
  { k: "modules", l: "业务模块" },
  { k: "info", l: "基本信息" },
];

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { projectId } = await params;
  const { tab: t } = await searchParams;
  const tab = TABS.some((x) => x.k === t) ? t! : "members";
  const { project, user, role } = await requireProject(projectId, { manage: true });

  let body: React.ReactNode = null;
  if (tab === "members") {
    const members = await listProjectMembers(projectId);
    body = (
      <MembersTab
        projectId={projectId}
        meId={user.id}
        members={members.map((m) => ({ userId: m.userId, name: m.name, email: m.email, title: m.title ?? "", role: m.role, isActive: m.isActive, joinedAt: m.joinedAt.toISOString(), vdrGroup: m.vdrGroup, organization: m.organization }))}
      />
    );
  } else if (tab === "fa" || tab === "dd") {
    const [fields, n] = await Promise.all([listFields(projectId, tab), countItems(projectId, tab)]);
    body = (
      <FieldsTab
        key={tab}
        projectId={projectId}
        moduleKey={tab}
        itemCount={n}
        fields={fields.map((f) => ({ id: f.id, key: f.key, label: f.label, type: f.type, options: f.options, role: f.role, required: f.required, showInTable: f.showInTable, width: f.width, aliases: f.aliases, formula: f.formula, config: f.config }))}
      />
    );
  } else if (tab === "vdr-bin") {
    const { folders, files } = await loadVdr(projectId, { includeDeleted: true });
    const byId = new Map(folders.map((f) => [f.id, f]));
    const pathOf = (id: string | null) => {
      const names: string[] = [];
      let c = id ? byId.get(id) : undefined;
      while (c) { names.unshift(c.name); c = c.parentId ? byId.get(c.parentId) : undefined; }
      return names.join(" / ");
    };
    const delIds = [...new Set([...folders, ...files].map((x) => x.deletedBy).filter(Boolean))] as string[];
    const names = delIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, delIds)) : [];
    const nm = new Map(names.map((u) => [u.id, u.name]));
    const folderBatches = new Set(folders.filter((f) => f.deletedAt && f.deleteBatch).map((f) => f.deleteBatch));
    const rootFolders = folders.filter((f) => f.deletedAt && !(f.parentId && byId.get(f.parentId)?.deleteBatch === f.deleteBatch));
    const rows: BinRow[] = [
      ...rootFolders.map((f) => {
        const fs = files.filter((x) => x.deleteBatch === f.deleteBatch);
        return { type: "folder" as const, id: f.id, name: f.name, path: pathOf(f.parentId), size: fs.reduce((s, x) => s + x.size, 0), files: fs.length, deletedAt: f.deletedAt!.toISOString(), deletedBy: f.deletedBy ? nm.get(f.deletedBy) ?? "" : "" };
      }),
      ...files.filter((x) => x.deletedAt && !folderBatches.has(x.deleteBatch)).map((x) => ({
        type: "file" as const, id: x.id, name: x.name, path: pathOf(x.folderId), size: x.size, files: 0, deletedAt: x.deletedAt!.toISOString(), deletedBy: x.deletedBy ? nm.get(x.deletedBy) ?? "" : "",
      })),
    ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
    body = <VdrBinTab projectId={projectId} rows={rows} />;
  } else if (tab === "modules") {
    const mods = await db.select().from(projectModules).where(eq(projectModules.projectId, projectId));
    body = <ModulesTab projectId={projectId} enabled={mods.filter((m) => m.enabled).map((m) => m.moduleKey)} />;
  } else {
    body = <InfoTab projectId={projectId} p={{ code: project.code, name: project.name, clientName: project.clientName ?? "", dealType: project.dealType ?? "", description: project.description ?? "" }} />;
  }

  return (
    <>
      <PageHeader
        eyebrow={`${project.code} · Project Settings`}
        title="项目管理"
        desc={role === "super_admin" ? "您以全局管理员身份管理本项目" : "项目管理员可维护成员、字段定义与启用模块"}
      />
      <div className="mb-5 flex gap-1 border-b border-line">
        {TABS.map((x) => (
          <Link
            key={x.k}
            href={`/p/${projectId}/settings?tab=${x.k}`}
            className={cn("-mb-px border-b-2 px-4 py-2.5 text-sm transition", tab === x.k ? "border-brand-sage text-brand-paper" : "border-transparent text-brand-sage hover:text-brand-mist")}
          >
            {x.l}
          </Link>
        ))}
      </div>
      {body}
    </>
  );
}
