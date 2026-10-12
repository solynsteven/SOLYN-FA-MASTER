"use client";

import Link from "next/link";
import { createContext, useContext } from "react";
import { FolderOpen } from "lucide-react";

export type FolderOpt = { id: string; path: string; name: string; depth: number };
type Ctx = { projectId: string; folders: FolderOpt[]; vdrEnabled: boolean };

const C = createContext<Ctx>({ projectId: "", folders: [], vdrEnabled: false });
export const VdrFoldersProvider = C.Provider;
export const useVdrFolders = () => useContext(C);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 列表单元格：显示文件夹路径，点击跳转到 VDR 中该文件夹；旧的文本值原样显示 */
export function FolderCell({ v }: { v: unknown }) {
  const { projectId, folders } = useVdrFolders();
  const s = String(v ?? "");
  const f = folders.find((x) => x.id === s);
  if (f)
    return (
      <Link
        href={`/p/${projectId}/vdr?folder=${f.id}`}
        onClick={(e) => e.stopPropagation()}
        title={`在 VDR 中打开：${f.path}`}
        className="inline-flex max-w-full items-start gap-1.5 text-brand-mist underline decoration-brand-sage/40 underline-offset-2 hover:text-brand-paper hover:decoration-brand-sage"
      >
        <FolderOpen size={13} className="mt-[3px] shrink-0 text-brand-sage" />
        <span className="line-clamp-2">{f.path}</span>
      </Link>
    );
  if (UUID.test(s)) return <span className="text-xs text-brand-sage/70">（VDR 文件夹已删除或无权查看）</span>;
  return <span className="text-brand-mist/85">{s}</span>;
}

/** 编辑：从本项目 VDR 文件夹中选择 */
export function FolderSelect({ value, onChange, disabled }: { value: unknown; onChange: (v: unknown) => void; disabled?: boolean }) {
  const { projectId, folders, vdrEnabled } = useVdrFolders();
  const s = String(value ?? "");
  const cur = folders.find((x) => x.id === s);
  const legacy = s && !cur ? s : null;
  return (
    <div className="space-y-1">
      <select className="input" value={s} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">— 未关联 —</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>{"　".repeat(f.depth)}{f.depth ? "└ " : ""}{f.name}</option>
        ))}
        {legacy && <option value={legacy}>{UUID.test(legacy) ? "（已删除的文件夹）" : `原文本：${legacy}`}</option>}
      </select>
      <div className="flex items-center gap-2 text-2xs text-brand-sage">
        {cur ? (
          <Link href={`/p/${projectId}/vdr?folder=${cur.id}`} className="inline-flex items-center gap-1 hover:text-brand-paper"><FolderOpen size={12} />{cur.path}</Link>
        ) : !vdrEnabled ? (
          <span>本项目未启用 VDR 模块</span>
        ) : folders.length === 0 ? (
          <span>VDR 中还没有文件夹</span>
        ) : legacy && !UUID.test(legacy) ? (
          <span>当前为导入的文本，请选择对应的 VDR 文件夹</span>
        ) : null}
      </div>
    </div>
  );
}
