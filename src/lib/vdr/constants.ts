import type { VdrGroup, VdrLevel } from "@/db/schema";

export const VDR_GROUPS: { code: VdrGroup; label: string; desc: string }[] = [
  { code: "ADM", label: "ADM", desc: "卖方 FA（管理员）" },
  { code: "SEL", label: "SEL", desc: "卖方及其顾问" },
  { code: "BID1", label: "BID1", desc: "一次入札候选" },
  { code: "BID2", label: "BID2", desc: "二次入札候选" },
  { code: "EXC", label: "EXC", desc: "独家谈判对象" },
  { code: "DD", label: "DD", desc: "买方尽调顾问" },
];

/** 阶梯式权限：X 不可见 < V 仅在线阅览 < P 可打印 < O 原件可下载 */
export const LEVEL_ORDER: VdrLevel[] = ["X", "V", "P", "O"];
export const LEVELS: { code: VdrLevel; label: string; short: string; color: string }[] = [
  { code: "O", label: "原件可下载", short: "O", color: "#A6E0C1" },
  { code: "P", label: "可打印", short: "P", color: "#E3C98A" },
  { code: "V", label: "仅在线阅览", short: "V", color: "#BAC3BF" },
  { code: "X", label: "不可见", short: "✕", color: "#6B7A73" },
];
export const levelMeta = (l: VdrLevel) => LEVELS.find((x) => x.code === l)!;
export const atLeast = (have: VdrLevel, need: VdrLevel) => LEVEL_ORDER.indexOf(have) >= LEVEL_ORDER.indexOf(need);

/** 未设置任何规则时的默认权限 */
export const DEFAULT_GROUP_LEVEL: Record<VdrGroup, VdrLevel> = { ADM: "O", SEL: "X", BID1: "X", BID2: "X", EXC: "X", DD: "X" };

export const PREVIEWABLE = {
  pdf: (ct: string, name: string) => ct === "application/pdf" || /\.pdf$/i.test(name),
  image: (ct: string, name: string) => ct.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name),
  docx: (_ct: string, name: string) => /\.docx$/i.test(name),
  xlsx: (_ct: string, name: string) => /\.xlsx$/i.test(name),
};
export function previewKind(ct: string | null, name: string): "pdf" | "image" | "docx" | "xlsx" | null {
  const c = ct ?? "";
  for (const k of ["pdf", "image", "docx", "xlsx"] as const) if (PREVIEWABLE[k](c, name)) return k;
  return null;
}

export const VDR_ACTION_LABEL: Record<string, string> = {
  upload: "上传", delete: "删除", restore: "恢复", purge: "彻底删除", view: "阅览", print: "打印", download: "下载",
  folder_create: "新建目录", folder_rename: "重命名目录", folder_delete: "删除目录", folder_restore: "恢复目录", folder_purge: "彻底删除目录",
  phase_create: "新建 Phase 区", phase_update: "修改 Phase 设置", phase_unlock: "输入密码进入 Phase",
  permission: "修改权限", file_update: "修改文件信息",
};

export function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
