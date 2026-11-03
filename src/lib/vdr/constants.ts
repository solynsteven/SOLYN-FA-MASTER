export { CAPS, LEVELS, levelMeta, levelOf, normCaps, has, capsOfLevel, DOWNLOAD_MODES } from "./caps";

/** 内置权限组（新项目自动创建；可在「VDR 安全中心」改名、调整策略或新增自定义组） */
export const BUILTIN_GROUPS = [
  { code: "ADM", name: "内部管理层", description: "卖方 FA / 项目管理团队", kind: "internal", defaultLevel: "L5" },
  { code: "SEL", name: "卖方及其顾问", description: "卖方公司及卖方顾问", kind: "seller", defaultLevel: "L0" },
  { code: "BID1", name: "竞标买方组 1", description: "一次入札候选买方", kind: "buyer", defaultLevel: "L0" },
  { code: "BID2", name: "竞标买方组 2", description: "二次入札候选买方", kind: "buyer", defaultLevel: "L0" },
  { code: "EXC", name: "独家谈判对象", description: "进入独家谈判的买方", kind: "buyer", defaultLevel: "L0" },
  { code: "DD", name: "买方尽调顾问", description: "买方委托的尽调机构", kind: "advisor", defaultLevel: "L0" },
  { code: "LEGAL", name: "法律顾问组", description: "律师事务所", kind: "advisor", defaultLevel: "L0" },
  { code: "FIN", name: "财务组", description: "会计师 / 税理士 / 财务顾问", kind: "advisor", defaultLevel: "L0" },
] as const;

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
  permission: "修改权限", file_update: "修改文件信息", security: "修改文档安全策略",
  download_watermark: "下载水印副本", download_irm: "下载 IRM 受控文件", download_encrypted: "下载加密文件", download_original: "下载原件",
  irm_open: "打开 IRM 文件", irm_print: "IRM 文件打印", irm_revoke: "远程撤销 IRM 文件", irm_update: "修改 IRM 策略", irm_denied: "IRM 打开被拒",
  annotate: "添加批注", share: "外部分享", nda_sign: "签署 NDA", access_denied: "访问被拦截", invite: "发出邀请", invite_accept: "接受邀请",
  invite_revoke: "撤销邀请", new_device: "陌生设备登录", session_revoke: "强制下线", group_update: "修改权限组", member_update: "修改成员访问",
  settings_update: "修改安全设置", irm_password_view: "查看加密副本密码",
};

export function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
