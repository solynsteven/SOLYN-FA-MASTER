"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Folder, FolderOpen, FolderPlus, Upload, Lock, LockOpen, ChevronRight, ChevronDown, Shield, Pencil, Trash2, History, Settings2,
  Eye, Download, FileText, FileSpreadsheet, FileImage, File as FileIcon, Layers, BarChart3, Plus, EyeOff, Clock,
} from "lucide-react";
import { ConfirmButton, EmptyState, cn, useAction, Alert } from "@/components/ui";
import { LEVELS, VDR_GROUPS, levelMeta, fmtSize, atLeast } from "@/lib/vdr/constants";
import { makeResolver } from "@/lib/vdr/resolve";
import { fmtDateTime } from "@/lib/format";
import type { VdrGroup, VdrLevel } from "@/db/schema";
import { deleteFolder, deleteFile, createFolder, renameFolder } from "@/app/p/[projectId]/vdr/actions";
import { Viewer } from "./Viewer";
import { LevelTag, PhaseDialog, NameDialog, UploadDialog, FileEditDialog, PermDialog, UnlockDialog, LogDialog } from "./dialogs";
import type { VFolder, VFile, VPerm, VMember, CodeOpt, Me } from "./types";

export type { VFolder, VFile };

type Props = {
  projectId: string; canManage: boolean; storage: "blob" | "local"; me: Me;
  folders: VFolder[]; files: VFile[]; perms: VPerm[]; members: VMember[]; faCodes: CodeOpt[]; ddCodes: CodeOpt[];
};

const fileIcon = (f: VFile) => (f.preview === "pdf" || f.preview === "docx" ? FileText : f.preview === "xlsx" ? FileSpreadsheet : f.preview === "image" ? FileImage : FileIcon);

export function VdrClient(p: Props) {
  const router = useRouter();
  const { canManage, projectId } = p;
  const [viewAs, setViewAs] = useState<VdrGroup | "">("");
  const [current, setCurrent] = useState<string | null>(() => p.folders.find((f) => f.isPhase && !f.locked)?.id ?? null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(p.folders.filter((f) => f.isPhase).map((f) => f.id)));
  const [dialog, setDialog] = useState<
    | { k: "phase"; phase?: VFolder } | { k: "newFolder" } | { k: "rename"; folder: VFolder } | { k: "upload" } | { k: "edit"; file: VFile }
    | { k: "perm"; target: { type: "folder" | "file"; id: string; name: string; folderId: string | null } } | { k: "unlock"; phase: VFolder } | { k: "log"; folder: VFolder } | null
  >(null);
  const [viewing, setViewing] = useState<VFile | null>(null);
  const del = useAction();

  // 管理员“按权限组视角预览”：在浏览器中用同一套规则重新计算
  const view = useMemo(() => {
    if (!canManage || !viewAs) return { folders: p.folders, files: p.files, preview: false };
    const R = makeResolver(p.folders, p.perms, { userId: "__preview__", isManager: false, group: viewAs, organization: null });
    const files = p.files.map((f) => ({ ...f, level: R.fileLevel(f) })).filter((f) => f.level !== "X" && (R.phaseOf(f.folderId) as VFolder | undefined)?.open);
    const keep = new Set<string>();
    const byId = new Map(p.folders.map((f) => [f.id, f]));
    const up = (id: string | null) => { let c = id ? byId.get(id) : undefined; while (c && !keep.has(c.id)) { keep.add(c.id); c = c.parentId ? byId.get(c.parentId) : undefined; } };
    files.forEach((f) => up(f.folderId));
    p.folders.forEach((f) => { if (R.folderLevel(f.id) !== "X") up(f.id); });
    const folders = p.folders.filter((f) => (f.isPhase ? f.open : keep.has(f.id) && (byId.get((R.phaseOf(f.id) as VFolder).id)?.open ?? false))).map((f) => ({ ...f, level: R.folderLevel(f.id) }));
    return { folders, files, preview: true };
  }, [canManage, viewAs, p.folders, p.files, p.perms]);

  const children = (pid: string | null) => view.folders.filter((f) => f.parentId === pid).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"));
  const cur = view.folders.find((f) => f.id === current) ?? null;
  const phases = children(null);
  const path: VFolder[] = [];
  for (let c = cur; c; c = c.parentId ? view.folders.find((f) => f.id === c!.parentId) ?? null : null) path.unshift(c);
  const phase = path[0];
  const locked = !!phase?.locked && !canManage;
  const subFolders = cur && !locked ? children(cur.id) : [];
  const curFiles = cur && !locked ? view.files.filter((f) => f.folderId === cur.id).sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true })) : [];
  const countIn = (id: string): number => view.files.filter((f) => f.folderId === id).length + children(id).reduce((s, c) => s + countIn(c.id), 0);

  // 管理员：每行显示各权限组的生效级别
  const groupMatrix = useMemo(() => {
    if (!canManage) return null;
    const rs = VDR_GROUPS.map((g) => ({ g: g.code, R: makeResolver(p.folders, p.perms, { userId: "__g__", isManager: false, group: g.code, organization: null }) }));
    return {
      folder: (id: string) => rs.map(({ g, R }) => ({ g, l: R.folderLevel(id) })),
      file: (f: VFile) => rs.map(({ g, R }) => ({ g, l: R.fileLevel(f) })),
      hasOwn: (type: "folder" | "file", id: string) => p.perms.some((x) => x.targetType === type && x.targetId === id),
    };
  }, [canManage, p.folders, p.perms]);

  const watermark = `${p.me.name} · ${p.me.organization ?? p.me.group ?? "Solyn"} · ${fmtDateTime(new Date())} · 商业机密`;
  const open = (f: VFolder) => {
    if (f.isPhase && f.locked && !canManage) { setDialog({ k: "unlock", phase: f }); return; }
    setCurrent(f.id);
    setExpanded((s) => new Set([...s, ...path.map((x) => x.id), f.id]));
  };

  const Tree = ({ pid, depth }: { pid: string | null; depth: number }) => (
    <>
      {children(pid).map((f) => {
        const kids = children(f.id);
        const isOpen = expanded.has(f.id);
        const active = f.id === current;
        const showKids = isOpen && !(f.isPhase && f.locked && !canManage);
        return (
          <div key={f.id}>
            <div
              className={cn("group flex cursor-pointer items-center gap-1.5 rounded-md py-1.5 pr-2 text-[13px] transition", active ? "bg-ink-700 text-brand-paper" : "text-brand-mist/80 hover:bg-ink-850 hover:text-brand-paper")}
              style={{ paddingLeft: 6 + depth * 14 }}
              onClick={() => open(f)}
            >
              <button
                className={cn("rounded p-0.5 text-brand-sage hover:text-brand-paper", !kids.length && "invisible")}
                onClick={(e) => { e.stopPropagation(); setExpanded((s) => { const n = new Set(s); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; }); }}
              >
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              {f.isPhase ? <Layers size={14} className="shrink-0 text-brand-sage" /> : active ? <FolderOpen size={14} className="shrink-0 text-brand-sage" /> : <Folder size={14} className="shrink-0 text-brand-sage" />}
              <span className={cn("flex-1 truncate", f.isPhase && "font-medium")}>{f.name}</span>
              {f.isPhase && f.hasPassword && (f.locked && !canManage ? <Lock size={11} className="text-warn" /> : <LockOpen size={11} className="text-brand-sage/60" />)}
              {f.isPhase && canManage && !view.preview && (
                <span className={cn("rounded px-1 text-[9px]", f.open ? "bg-brand-green/40 text-brand-mist" : "bg-ink-600 text-brand-sage")}>
                  {f.open ? "开放" : f.openMode === "by_task" ? "待进度" : "关闭"}
                </span>
              )}
            </div>
            {showKids && <Tree pid={f.id} depth={depth + 1} />}
          </div>
        );
      })}
    </>
  );

  const Matrix = ({ items, own }: { items: { g: string; l: VdrLevel }[]; own: boolean }) => (
    <span className="inline-flex items-center gap-0.5" title={items.map((x) => `${x.g}: ${levelMeta(x.l).label}`).join("\n")}>
      {items.map((x) => (
        <span key={x.g} className="w-[18px] text-center font-num text-[10px] font-semibold" style={{ color: levelMeta(x.l).color, opacity: x.l === "X" ? 0.5 : 1 }}>{levelMeta(x.l).short}</span>
      ))}
      {own && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-warn" title="此处有单独设置的权限" />}
    </span>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {/* 左侧：目录树 */}
      <aside className="card flex max-h-[calc(100vh-170px)] flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
          <span className="text-xs font-medium text-brand-mist">目录</span>
          {canManage && <button className="btn-ghost btn-sm" onClick={() => setDialog({ k: "phase" })}><Plus size={13} />Phase 区</button>}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {phases.length ? <Tree pid={null} depth={0} /> : <div className="px-2 py-6 text-center text-xs text-brand-sage">{view.preview ? "该视角下没有可见的 Phase 区" : canManage ? "先新建一个 Phase 区" : "暂无已开放的资料"}</div>}
        </div>
        <div className="space-y-1 border-t border-line px-3 py-2.5">
          {LEVELS.filter((l) => canManage || l.code !== "X").map((l) => (
            <div key={l.code} className="flex items-center gap-2 text-2xs">
              <span className="w-4 text-center font-num font-semibold" style={{ color: l.color }}>{l.short}</span>
              <span style={{ color: l.color }}>文件名</span>
              <span className="text-brand-sage">{l.label}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* 右侧：内容 */}
      <section className="min-w-0">
        {canManage && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-ink-900 px-3 py-2">
            <span className="text-2xs text-brand-sage">视角</span>
            <select className="input w-auto py-1 text-xs" value={viewAs} onChange={(e) => setViewAs(e.target.value as VdrGroup | "")}>
              <option value="">管理员（全部）</option>
              {VDR_GROUPS.map((g) => <option key={g.code} value={g.code}>以 {g.code} · {g.desc} 查看</option>)}
            </select>
            {view.preview && <span className="inline-flex items-center gap-1 text-2xs text-warn"><EyeOff size={12} />预览模式：只显示该权限组能看到的内容与级别（未开放的 Phase 区已隐藏）</span>}
            <div className="ml-auto flex gap-2">
              <Link href={`/p/${projectId}/vdr/analytics`} className="btn-secondary btn-sm"><BarChart3 size={13} />访问分析</Link>
            </div>
          </div>
        )}

        {!cur ? (
          <div className="card">
            {view.preview ? (
              <EmptyState icon={<EyeOff size={28} strokeWidth={1.3} />} title={phases.length ? "请从左侧选择目录" : `${viewAs} 当前看不到任何内容`} desc={phases.length ? undefined : "可能是 Phase 区尚未开放，或该权限组在所有目录上都是「不可见」。"} />
            ) : (
              <EmptyState icon={<Layers size={28} strokeWidth={1.3} />} title={canManage ? (phases.length ? "请从左侧选择目录" : "还没有 Phase 区") : phases.length ? "请从左侧选择目录" : "暂无已开放的资料"}
                desc={canManage && !phases.length ? "VDR 顶层按 Phase 区划分，每个 Phase 区可单独设密码与开放方式。" : undefined}
                action={canManage && !phases.length && <button className="btn-primary" onClick={() => setDialog({ k: "phase" })}><Plus size={14} />新建 Phase 区</button>} />
            )}
          </div>
        ) : (
          <div className="card">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm">
                {path.map((f, i) => (
                  <span key={f.id} className="inline-flex items-center gap-1">
                    {i > 0 && <ChevronRight size={13} className="text-brand-sage" />}
                    <button className={cn("hover:underline", i === path.length - 1 ? "text-brand-paper" : "text-brand-sage")} onClick={() => open(f)}>{f.name}</button>
                  </span>
                ))}
                {phase && !phase.open && canManage && <span className="ml-2 inline-flex items-center gap-1 rounded bg-ink-700 px-1.5 py-0.5 text-2xs text-brand-sage"><Clock size={10} />{phase.openMode === "by_task" ? `待 ${phase.openTaskCode} ${phase.openTrigger === "done" ? "完成" : "开始"}后开放` : "未开放"}</span>}
              </div>
              {canManage && !view.preview && (
                <div className="flex flex-wrap gap-1.5">
                  {cur.isPhase && <button className="btn-secondary btn-sm" onClick={() => setDialog({ k: "phase", phase: cur })}><Settings2 size={13} />Phase 设置</button>}
                  <button className="btn-secondary btn-sm" onClick={() => setDialog({ k: "perm", target: { type: "folder", id: cur.id, name: cur.name, folderId: cur.parentId } })}><Shield size={13} />权限</button>
                  <button className="btn-secondary btn-sm" onClick={() => setDialog({ k: "log", folder: cur })}><History size={13} />操作记录</button>
                  <button className="btn-secondary btn-sm" onClick={() => setDialog({ k: "rename", folder: cur })}><Pencil size={13} />重命名</button>
                  <ConfirmButton className="btn-danger btn-sm" title={`删除${cur.isPhase ? " Phase 区" : "目录"}`} confirmText="移入回收站"
                    body={<>将「{cur.name}」及其中 {countIn(cur.id)} 个文件、全部下级目录移入回收站。可在「项目管理 → VDR 回收站」恢复或彻底删除。</>}
                    onConfirm={() => del.exec(() => deleteFolder(projectId, cur.id), () => { setCurrent(cur.parentId); router.refresh(); })}>
                    <Trash2 size={13} />删除
                  </ConfirmButton>
                  <button className="btn-secondary btn-sm" onClick={() => setDialog({ k: "newFolder" })}><FolderPlus size={13} />新建目录</button>
                  <button className="btn-primary btn-sm" onClick={() => setDialog({ k: "upload" })}><Upload size={13} />上传文件</button>
                </div>
              )}
            </div>
            <Alert>{del.error}</Alert>
            {locked ? (
              <EmptyState icon={<Lock size={26} strokeWidth={1.3} />} title="该 Phase 区受密码保护" desc="输入访问密码后即可浏览。" action={<button className="btn-primary" onClick={() => setDialog({ k: "unlock", phase })}>输入密码</button>} />
            ) : subFolders.length + curFiles.length === 0 ? (
              <EmptyState icon={<FolderOpen size={26} strokeWidth={1.3} />} title="此目录为空" desc={canManage && !view.preview ? "可新建下级目录或上传文件。" : undefined} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">名称</th>
                      <th className="th w-28">项目任务编码</th>
                      <th className="th w-36">材料编码</th>
                      <th className="th w-20 text-right">大小</th>
                      <th className="th w-40">上传</th>
                      {groupMatrix && !view.preview && <th className="th w-36" title="各权限组的生效级别">{VDR_GROUPS.map((g) => <span key={g.code} className="inline-block w-[18px] text-center text-[8px]">{g.code.replace("BID", "B")}</span>)}</th>}
                      <th className="th w-40" />
                    </tr>
                  </thead>
                  <tbody>
                    {subFolders.map((f) => (
                      <tr key={f.id} className="cursor-pointer hover:bg-ink-850/70" onClick={() => open(f)}>
                        <td className="td"><span className="inline-flex items-center gap-2 text-brand-paper"><Folder size={15} className="text-brand-sage" />{f.name}<span className="text-2xs text-brand-sage">{countIn(f.id)} 个文件</span></span></td>
                        <td className="td" /><td className="td" /><td className="td" />
                        <td className="td font-num text-xs text-brand-sage">{fmtDateTime(f.createdAt)}</td>
                        {groupMatrix && !view.preview && <td className="td"><Matrix items={groupMatrix.folder(f.id)} own={groupMatrix.hasOwn("folder", f.id)} /></td>}
                        <td className="td text-right" onClick={(e) => e.stopPropagation()}>
                          {canManage && !view.preview && <button className="btn-ghost btn-sm" onClick={() => setDialog({ k: "perm", target: { type: "folder", id: f.id, name: f.name, folderId: f.parentId } })}><Shield size={13} /></button>}
                        </td>
                      </tr>
                    ))}
                    {curFiles.map((f) => {
                      const Icon = fileIcon(f);
                      const m = levelMeta(f.level);
                      const canView = !!f.preview && atLeast(f.level, "V");
                      return (
                        <tr key={f.id} className="hover:bg-ink-850/70">
                          <td className="td">
                            <button className={cn("inline-flex max-w-full items-center gap-2 text-left", canView ? "hover:underline" : "cursor-default")} disabled={!canView} onClick={() => canView && setViewing(f)} title={canView ? "在线阅览" : f.preview ? "" : "该格式不支持在线阅览"}>
                              <Icon size={15} className="shrink-0" style={{ color: m.color }} />
                              <span className="truncate" style={{ color: m.color, textDecoration: f.level === "X" ? "line-through" : undefined }}>{f.name}</span>
                              <LevelTag level={f.level} />
                            </button>
                            {f.description && <div className="mt-0.5 pl-6 text-2xs text-brand-sage">{f.description}</div>}
                          </td>
                          <td className="td text-xs">{f.taskCode ? <span title={f.taskTitle ?? ""} className="font-num text-brand-mist">{f.taskCode}</span> : <span className="text-brand-sage/40">—</span>}</td>
                          <td className="td text-xs">{f.ddCode ? <span title={f.ddTitle ?? ""} className="font-num text-brand-mist">{f.ddCode}</span> : <span className="text-brand-sage/40">—</span>}</td>
                          <td className="td text-right font-num text-xs text-brand-sage">{fmtSize(f.size)}</td>
                          <td className="td text-2xs text-brand-sage"><div className="font-num">{fmtDateTime(f.createdAt)}</div><div>{f.uploadedBy}</div></td>
                          {groupMatrix && !view.preview && <td className="td"><Matrix items={groupMatrix.file(f)} own={groupMatrix.hasOwn("file", f.id)} /></td>}
                          <td className="td">
                            <div className="flex justify-end gap-1">
                              {canView && <button className="btn-ghost btn-sm" title="在线阅览" onClick={() => setViewing(f)}><Eye size={13} /></button>}
                              {atLeast(f.level, "O") && !view.preview && <a className="btn-ghost btn-sm" title="下载原件" href={`/p/${projectId}/vdr/file/${f.id}?mode=download`}><Download size={13} /></a>}
                              {canManage && !view.preview && (
                                <>
                                  <button className="btn-ghost btn-sm" title="权限" onClick={() => setDialog({ k: "perm", target: { type: "file", id: f.id, name: f.name, folderId: f.folderId } })}><Shield size={13} /></button>
                                  <button className="btn-ghost btn-sm" title="文件信息" onClick={() => setDialog({ k: "edit", file: f })}><Pencil size={13} /></button>
                                  <ConfirmButton className="btn-ghost btn-sm text-danger" title="删除文件" confirmText="移入回收站" body={<>将「{f.name}」移入回收站，删除时间与操作人会被记录，可在「项目管理 → VDR 回收站」恢复。</>}
                                    onConfirm={() => del.exec(() => deleteFile(projectId, f.id), () => router.refresh())}>
                                    <Trash2 size={13} />
                                  </ConfirmButton>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {dialog?.k === "phase" && <PhaseDialog projectId={projectId} phase={dialog.phase} faCodes={p.faCodes} onClose={() => setDialog(null)} />}
      {dialog?.k === "newFolder" && cur && <NameDialog title={`在「${cur.name}」下新建目录`} onSave={(n) => createFolder(projectId, cur.id, n)} onClose={() => setDialog(null)} />}
      {dialog?.k === "rename" && <NameDialog title="重命名" initial={dialog.folder.name} onSave={(n) => renameFolder(projectId, dialog.folder.id, n)} onClose={() => setDialog(null)} />}
      {dialog?.k === "upload" && cur && <UploadDialog projectId={projectId} folder={cur} storage={p.storage} faCodes={p.faCodes} ddCodes={p.ddCodes} onClose={() => setDialog(null)} />}
      {dialog?.k === "edit" && <FileEditDialog projectId={projectId} file={dialog.file} faCodes={p.faCodes} ddCodes={p.ddCodes} onClose={() => setDialog(null)} />}
      {dialog?.k === "perm" && <PermDialog projectId={projectId} target={dialog.target} folders={p.folders} perms={p.perms} members={p.members} onClose={() => setDialog(null)} />}
      {dialog?.k === "unlock" && <UnlockDialog projectId={projectId} phase={dialog.phase} onClose={() => setDialog(null)} />}
      {dialog?.k === "log" && <LogDialog projectId={projectId} folder={dialog.folder} onClose={() => setDialog(null)} />}
      {viewing && <Viewer projectId={projectId} file={viewing} watermark={watermark} onClose={() => setViewing(null)} />}
    </div>
  );
}
