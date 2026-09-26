"use client";

import { useRouter } from "next/navigation";
import { RotateCcw, Trash2, Folder, FileText } from "lucide-react";
import { Alert, ConfirmButton, EmptyState, useAction } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { fmtSize } from "@/lib/vdr/constants";
import { restoreFile, purgeFile, restoreFolder, purgeFolder } from "@/app/p/[projectId]/vdr/actions";

export type BinRow = { type: "folder" | "file"; id: string; name: string; path: string; size: number; files: number; deletedAt: string; deletedBy: string };

export function VdrBinTab({ projectId, rows }: { projectId: string; rows: BinRow[] }) {
  const router = useRouter();
  const a = useAction();
  return (
    <>
      <p className="mb-4 max-w-3xl text-xs leading-5 text-brand-sage">
        VDR 中删除的文件与目录不会立即清除，而是保存在这里。<b className="font-medium text-brand-mist">恢复</b>会放回原位置（删除目录时其中的文件一并恢复）；
        <b className="font-medium text-brand-mist">彻底删除</b>会同时清除存储中的文件，无法找回。所有操作均写入 VDR 操作记录。
      </p>
      <Alert>{a.error}</Alert>
      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={<Trash2 size={26} strokeWidth={1.3} />} title="回收站为空" />
        ) : (
          <table className="w-full">
            <thead><tr><th className="th">名称</th><th className="th">原位置</th><th className="th w-24 text-right">大小</th><th className="th w-40">删除时间</th><th className="th w-28">删除人</th><th className="th w-44" /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.type + r.id} className="hover:bg-ink-850/60">
                  <td className="td">
                    <span className="inline-flex items-center gap-2 text-brand-paper">
                      {r.type === "folder" ? <Folder size={14} className="text-brand-sage" /> : <FileText size={14} className="text-brand-sage" />}
                      {r.name}
                      {r.type === "folder" && <span className="text-2xs text-brand-sage">含 {r.files} 个文件</span>}
                    </span>
                  </td>
                  <td className="td text-xs text-brand-sage">{r.path || "（顶层）"}</td>
                  <td className="td text-right font-num text-xs text-brand-sage">{fmtSize(r.size)}</td>
                  <td className="td font-num text-xs text-brand-sage">{fmtDateTime(r.deletedAt)}</td>
                  <td className="td text-xs">{r.deletedBy}</td>
                  <td className="td">
                    <div className="flex justify-end gap-1.5">
                      <button className="btn-secondary btn-sm" disabled={a.pending} onClick={() => a.exec(() => (r.type === "file" ? restoreFile(projectId, r.id) : restoreFolder(projectId, r.id)), () => router.refresh())}>
                        <RotateCcw size={12} />恢复
                      </button>
                      <ConfirmButton className="btn-danger btn-sm" title="彻底删除" confirmText="彻底删除"
                        body={<>将永久删除「{r.name}」{r.type === "folder" ? `及其中 ${r.files} 个文件` : ""}，存储中的文件一并清除，无法恢复。</>}
                        onConfirm={() => a.exec(() => (r.type === "file" ? purgeFile(projectId, r.id) : purgeFolder(projectId, r.id)), () => router.refresh())}>
                        <Trash2 size={12} />彻底删除
                      </ConfirmButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
