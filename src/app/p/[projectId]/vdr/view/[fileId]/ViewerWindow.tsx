"use client";

import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Viewer, type ViewerFile } from "@/components/vdr/Viewer";

export function ViewerWindow({ projectId, file, folderId, autoDownload, error }: { projectId: string; file?: ViewerFile; folderId?: string; autoDownload?: boolean; error?: string }) {
  const router = useRouter();
  const back = `/p/${projectId}/vdr${folderId ? `?folder=${folderId}` : ""}`;
  // 由 VDR 列表打开的标签页直接关闭；直接访问时返回 VDR
  const close = () => {
    window.close();
    setTimeout(() => router.push(back), 150);
  };
  if (error || !file) {
    return (
      <div className="card mx-auto mt-16 max-w-lg px-8 py-12 text-center">
        <ShieldAlert size={28} strokeWidth={1.3} className="mx-auto mb-4 text-brand-sage" />
        <div className="text-sm text-brand-paper">无法打开该文件</div>
        <p className="mt-2 text-xs text-brand-mist/85">{error}</p>
        <button className="btn-secondary mt-6" onClick={close}>关闭</button>
      </div>
    );
  }
  return <Viewer projectId={projectId} file={file} autoDownload={autoDownload} onClose={close} />;
}
