import "server-only";
import { NextResponse } from "next/server";
import { vdrContext, loadVdr, capsResolver, phaseIsOpen, faTaskStatuses, isPhaseUnlocked, type VdrCtx } from "./access";
import { logVdr } from "./events";
import { has } from "./caps";
import type { VdrCap, VdrDownloadMode, VdrFile } from "@/db/schema";

export type FileAccess = {
  ctx: VdrCtx; file: VdrFile; caps: VdrCap[];
  security: { fence: boolean; downloadModes: VdrDownloadMode[]; irmExpiryDays: number; irmPrintLimit: number };
};

/** 文件级访问检查：数据室门禁 → Phase 开放 / 密码 → 权限开关；失败时直接返回 HTTP 响应 */
export async function fileAccess(projectId: string, fileId: string, need: VdrCap): Promise<FileAccess | NextResponse> {
  const ctx = await vdrContext(projectId);
  if (!ctx) return new NextResponse("无权访问", { status: 403 });
  if (ctx.fail) {
    await logVdr(projectId, ctx.access.user.id, "access_denied", { fileId, detail: { code: ctx.fail.code } });
    return new NextResponse(ctx.fail.message, { status: 403 });
  }
  const data = await loadVdr(projectId);
  const file = data.files.find((f) => f.id === fileId);
  if (!file) return new NextResponse("文件不存在", { status: 404 });
  const R = capsResolver(ctx, data);
  if (!ctx.isManager) {
    const phase = R.phaseOf(file.folderId);
    if (!phase || !phaseIsOpen(phase, await faTaskStatuses(projectId))) return new NextResponse("该 Phase 区尚未开放", { status: 403 });
    if (!(await isPhaseUnlocked(phase, ctx.access.user.id))) return new NextResponse("请先输入 Phase 区密码", { status: 403 });
  }
  const caps = R.fileCaps(file);
  if (!has(caps, need)) return new NextResponse(`无「${NEED_LABEL[need]}」权限`, { status: 403 });
  const sec = R.securityOf(file, file.folderId);
  return {
    ctx, file, caps,
    security: {
      fence: !!sec.fence,
      downloadModes: sec.downloadModes ?? ctx.settings.download.modes,
      irmExpiryDays: sec.irmExpiryDays ?? ctx.settings.download.irmExpiryDays,
      irmPrintLimit: sec.irmPrintLimit ?? ctx.settings.download.irmPrintLimit,
    },
  };
}

const NEED_LABEL: Record<VdrCap, string> = { view: "查看", preview: "在线预览", download: "下载", print: "打印", copy: "复制文本", annotate: "批注", upload: "上传", edit: "修改", share: "外部分享" };

export const noStore = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
export const wmOpts = (ctx: VdrCtx, text?: string) => ({ text: text ?? ctx.watermark, opacity: ctx.settings.watermark.opacity, size: ctx.settings.watermark.size, density: ctx.settings.watermark.density });
