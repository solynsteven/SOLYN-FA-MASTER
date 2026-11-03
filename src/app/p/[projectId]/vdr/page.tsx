import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users, trackerItems } from "@/db/schema";
import { requireProject } from "@/lib/auth";
import { listProjectMembers, listFields } from "@/lib/queries";
import { loadVdr, faTaskStatuses, phaseIsOpen, isPhaseUnlocked, vdrContext, capsResolver, permLike } from "@/lib/vdr/access";
import { logVdr } from "@/lib/vdr/events";
import { levelOf, has } from "@/lib/vdr/caps";
import { VdrGate } from "@/components/vdr/VdrGate";
import { storageMode, blobAccess, blobAuth } from "@/lib/vdr/storage";
import { previewKind } from "@/lib/vdr/constants";
import { PageHeader } from "@/components/PageHeader";
import { VdrClient, type VFolder, type VFile } from "@/components/vdr/VdrClient";

export const metadata = { title: "VDR" };
export const dynamic = "force-dynamic";

export default async function VdrPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ folder?: string }> }) {
  const { projectId } = await params;
  const { folder: initialFolder } = await searchParams;
  const { project, user, canManage } = await requireProject(projectId, { module: "vdr" });
  const ctx = (await vdrContext(projectId))!;
  if (ctx.fail) {
    await logVdr(projectId, user.id, "access_denied", { detail: { code: ctx.fail.code } });
    return (
      <>
        <PageHeader eyebrow={`${project.code} · Virtual Data Room`} title="VDR 虚拟数据室" />
        <VdrGate projectId={projectId} fail={ctx.fail} />
      </>
    );
  }
  const viewer = ctx.viewer;
  const [data, taskStatus] = await Promise.all([loadVdr(projectId), faTaskStatuses(projectId)]);
  const { folders, files, perms } = data;
  const R = capsResolver(ctx, data);

  // Phase 状态
  const phaseState = new Map<string, { open: boolean; unlocked: boolean }>();
  for (const p of folders.filter((f) => !f.parentId)) {
    phaseState.set(p.id, { open: phaseIsOpen(p, taskStatus), unlocked: canManage || (await isPhaseUnlocked(p, user.id)) });
  }

  // 编码 → 名称（FA 任务 / DD 材料）
  const codeTitles = async (mk: "fa" | "dd") => {
    const fields = await listFields(projectId, mk);
    const titleK = fields.find((f) => f.role === "title")?.key;
    const rows = await db.select({ k: trackerItems.externalKey, data: trackerItems.data }).from(trackerItems)
      .where(and(eq(trackerItems.projectId, projectId), eq(trackerItems.moduleKey, mk), isNull(trackerItems.deletedAt)));
    return rows.filter((r) => r.k).map((r) => ({ code: r.k!, title: String((titleK && r.data[titleK]) ?? "").split("\n")[0] }))
      .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
  };
  const [faCodes, ddCodes] = await Promise.all([codeTitles("fa"), codeTitles("dd")]);
  const faMap = new Map(faCodes.map((x) => [x.code, x.title]));
  const ddMap = new Map(ddCodes.map((x) => [x.code, x.title]));

  const uploaderIds = [...new Set(files.map((f) => f.uploadedBy).filter(Boolean))] as string[];
  const uploaders = uploaderIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, uploaderIds)) : [];
  const uname = new Map(uploaders.map((u) => [u.id, u.name]));

  // 可见性（非管理员）：未开放的 Phase 隐藏；未解锁的 Phase 只显示入口；其余按权限过滤
  const phaseOk = (folderId: string) => {
    const ph = R.phaseOf(folderId);
    const st = ph ? phaseState.get(ph.id) : undefined;
    return !!st && st.open && st.unlocked;
  };
  const visibleFiles = files.filter((f) => canManage || (phaseOk(f.folderId) && has(R.fileCaps(f), "view")));
  const hasVisibleDesc = new Set<string>();
  const byId = new Map(folders.map((f) => [f.id, f]));
  const markUp = (id: string | null) => {
    let cur = id ? byId.get(id) : undefined;
    while (cur && !hasVisibleDesc.has(cur.id)) { hasVisibleDesc.add(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined; }
  };
  for (const f of visibleFiles) markUp(f.folderId);
  for (const f of folders) if (f.parentId && has(R.folderCaps(f.id), "view") && phaseOk(f.id)) markUp(f.id);

  const vFolders: VFolder[] = folders
    .filter((f) => {
      if (canManage) return true;
      if (!f.parentId) return phaseState.get(f.id)?.open ?? false;
      return phaseOk(f.id) && (has(R.folderCaps(f.id), "view") || hasVisibleDesc.has(f.id));
    })
    .map((f) => ({
      id: f.id, parentId: f.parentId, name: f.name, isPhase: !f.parentId, sortOrder: f.sortOrder, caps: R.folderCaps(f.id), lv: levelOf(R.folderCaps(f.id)), security: canManage ? f.security : null,
      open: !f.parentId ? phaseState.get(f.id)!.open : true, locked: !f.parentId ? !phaseState.get(f.id)!.unlocked : false,
      hasPassword: !!f.passwordHash, openMode: f.openMode, openTaskCode: f.openTaskCode, openTrigger: f.openTrigger,
      createdAt: f.createdAt.toISOString(),
    }));
  const vFiles: VFile[] = visibleFiles.map((f) => {
    const caps = R.fileCaps(f);
    const sec = R.securityOf(f, f.folderId);
    return {
    id: f.id, folderId: f.folderId, name: f.name, size: f.size, contentType: f.contentType, caps, lv: levelOf(caps), preview: previewKind(f.contentType, f.name),
    security: canManage ? f.security : null, fence: !!sec.fence, downloadModes: canManage ? ["watermark", "irm", "encrypted", "original"] : has(caps, "download") ? sec.downloadModes ?? ctx.settings.download.modes : [],
    taskCode: f.taskCode, taskTitle: f.taskCode ? faMap.get(f.taskCode) ?? null : null, ddCode: f.ddCode, ddTitle: f.ddCode ? ddMap.get(f.ddCode) ?? null : null,
    description: f.description, uploadedBy: f.uploadedBy ? uname.get(f.uploadedBy) ?? "" : "", createdAt: f.createdAt.toISOString(),
  };
  });

  const members = canManage ? await listProjectMembers(projectId) : [];

  return (
    <>
      <PageHeader
        eyebrow={`${project.code} · Virtual Data Room`}
        title="VDR 虚拟数据室"
        desc={canManage ? "按 Phase 区 → 目录 → 文件管理资料；权限可设到权限组、用户、目录与单个文件。所有上传、删除与访问均留痕。" : "文件名颜色表示您对该文件的权限级别。所有访问均会被记录。"}
      />
      <VdrClient
        projectId={projectId}
        canManage={canManage}
        storage={storageMode()}
        blobAccess={blobAccess}
        blobAuth={blobAuth()}
        initialFolder={initialFolder ?? null}
        me={{ id: user.id, name: user.name, group: viewer.group, organization: viewer.organization }}
        watermark={ctx.watermark}
        wmStyle={{ opacity: ctx.settings.watermark.opacity, size: ctx.settings.watermark.size, density: ctx.settings.watermark.density }}
        groups={ctx.groups.map((g) => ({ code: g.code, name: g.name, description: g.description, kind: g.kind, defaultCaps: ctx.groupDefaults[g.code] ?? [] }))}
        folders={vFolders}
        files={vFiles}
        perms={canManage ? perms.map((p) => ({ ...permLike(p), expiresAt: p.expiresAt?.toISOString() ?? null })) : []}
        members={members.map((m) => ({ id: m.userId, name: m.name, email: m.email, role: m.role, group: m.vdrGroup ?? null, organization: m.organization ?? null }))}
        faCodes={canManage ? faCodes : []}
        ddCodes={canManage ? ddCodes : []}
      />
    </>
  );
}
