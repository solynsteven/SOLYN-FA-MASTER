import type { VdrCap, VdrLevel, VdrDownloadMode } from "@/db/schema";

/** 9 个独立权限开关 */
export const CAPS: { key: VdrCap; label: string; desc: string }[] = [
  { key: "view", label: "查看", desc: "在目录中看到该文件 / 目录" },
  { key: "preview", label: "在线预览", desc: "在浏览器中分页预览（带动态水印）" },
  { key: "download", label: "下载", desc: "下载带水印副本 / IRM 受控文件（方式由文档安全策略决定）" },
  { key: "print", label: "打印", desc: "从预览器打印（带水印、留痕）" },
  { key: "copy", label: "复制文本", desc: "预览中可选择、复制文字；IRM 副本允许复制" },
  { key: "annotate", label: "批注", desc: "在预览器中添加批注" },
  { key: "upload", label: "上传", desc: "向该目录上传文件" },
  { key: "edit", label: "修改", desc: "重命名、编辑文件信息、删除（移入回收站）" },
  { key: "share", label: "外部分享", desc: "邀请项目外人员仅查看此文件（邀请制，需注册登录并签署 NDA）" },
];
export const ALL_CAPS = CAPS.map((c) => c.key);

/** 8 级预设（逐级累加） */
export const LEVELS: { code: Exclude<VdrLevel, "C">; short: string; label: string; caps: VdrCap[]; color: string }[] = [
  { code: "L0", short: "0", label: "不可见", caps: [], color: "#6B7A73" },
  { code: "L1", short: "1", label: "仅可见目录", caps: ["view"], color: "#8E9C95" },
  { code: "L2", short: "2", label: "在线预览", caps: ["view", "preview"], color: "#BAC3BF" },
  { code: "L3", short: "3", label: "预览 + 批注", caps: ["view", "preview", "annotate"], color: "#C9D6CE" },
  { code: "L4", short: "4", label: "可打印", caps: ["view", "preview", "annotate", "print"], color: "#E3C98A" },
  { code: "L5", short: "5", label: "可下载", caps: ["view", "preview", "annotate", "print", "download", "copy"], color: "#A6E0C1" },
  { code: "L6", short: "6", label: "协作（上传 / 修改）", caps: ["view", "preview", "annotate", "print", "download", "copy", "upload", "edit"], color: "#6FB691" },
  { code: "L7", short: "7", label: "完全控制（含外部分享）", caps: [...ALL_CAPS], color: "#4FA27A" },
];
export const CUSTOM_META = { code: "C" as const, short: "C", label: "自定义", color: "#B9A3D9" };

export function levelMeta(code: VdrLevel) {
  return LEVELS.find((l) => l.code === code) ?? CUSTOM_META;
}

export function normCaps(caps: readonly string[]): VdrCap[] {
  const set = new Set(caps);
  // 依赖关系：其它任何能力都隐含“查看”；下载 / 打印 / 复制 / 批注隐含“预览”
  if ([...set].some((c) => c !== "view")) set.add("view");
  if (["download", "print", "copy", "annotate"].some((c) => set.has(c))) set.add("preview");
  return ALL_CAPS.filter((c) => set.has(c));
}

/** 开关组合 → 预设等级（不匹配任何预设时为 C 自定义） */
export function levelOf(caps: readonly VdrCap[]): VdrLevel {
  const n = normCaps(caps);
  const k = n.join(",");
  return LEVELS.find((l) => normCaps(l.caps).join(",") === k)?.code ?? "C";
}

export const capsOfLevel = (code: VdrLevel): VdrCap[] => [...(LEVELS.find((l) => l.code === code)?.caps ?? [])];
export const has = (caps: readonly VdrCap[] | undefined, c: VdrCap) => !!caps?.includes(c);

export const DOWNLOAD_MODES: { key: VdrDownloadMode; label: string; desc: string }[] = [
  { key: "watermark", label: "水印副本", desc: "服务器实时生成该用户专属的带水印副本（PDF / Word）；离开 VDR 后仅能溯源，无法收回" },
  { key: "irm", label: "IRM 受控文件", desc: "加密文件包 .fasec，只能在 FA MASTER 安全阅读器中联网验权打开；可设有效期、打印次数、是否允许复制，管理员可随时远程撤销" },
  { key: "encrypted", label: "加密 PDF / Office", desc: "AES-256 密码加密并限制打印 / 复制，可用 Acrobat / Office 打开；无法远程撤销，靠水印溯源" },
  { key: "original", label: "原件", desc: "不加水印的原始文件，仅建议对内部人员开放" },
];
export const DEFAULT_DOWNLOAD_MODES: VdrDownloadMode[] = ["watermark", "irm"];
