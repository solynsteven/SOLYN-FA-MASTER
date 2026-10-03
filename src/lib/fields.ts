import type { FieldRole, FieldType } from "@/db/schema";
import type { TrackerModuleKey } from "./modules";

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "文本" },
  { value: "longtext", label: "多行文本" },
  { value: "number", label: "数字" },
  { value: "percent", label: "百分比" },
  { value: "date", label: "日期" },
  { value: "select", label: "下拉列表（单选）" },
  { value: "multiselect", label: "下拉列表（多选）" },
  { value: "boolean", label: "是 / 否" },
  { value: "user", label: "项目成员" },
];

export const FIELD_ROLES: { value: Exclude<FieldRole, null>; label: string; hint: string }[] = [
  { value: "code", label: "编号", hint: "导入时用于匹配已有记录" },
  { value: "title", label: "标题 / 名称", hint: "列表主列、抽屉标题" },
  { value: "category", label: "种类 / 类别", hint: "PDF 报告按此分组" },
  { value: "priority", label: "级别 / 优先级", hint: "PDF 报告按此统计" },
  { value: "status", label: "状态", hint: "PDF 报告与首页进度按此统计" },
  { value: "owner", label: "负责人 / 负责方", hint: "" },
  { value: "start_date", label: "开始日期", hint: "" },
  { value: "due_date", label: "截止日期", hint: "用于识别逾期" },
  { value: "progress", label: "完成度", hint: "" },
  { value: "access", label: "权限组", hint: "Q&A：按 ADM > SEL > EXC > DD 控制记录可见范围" },
];

export function fieldTypeLabel(t: string) {
  return FIELD_TYPES.find((f) => f.value === t)?.label ?? t;
}

export function hasOptions(t: FieldType) {
  return t === "select" || t === "multiselect";
}

type Tpl = {
  key: string; label: string; type: FieldType; role?: FieldRole; options?: string[];
  required?: boolean; width?: number; showInTable?: boolean; formula?: string; aliases?: string[];
  config?: { levelParents?: Record<string, string | null> };
};

/**
 * 默认字段模板，按 Project Aoyama 模板确定：
 *  - FA：《项目管理进度表 List v2》（Sell-side M&A 進捗管理表）A〜R 列
 *  - DD：《DD材料信息收集进度表 List v5》「資料依頼リスト」A〜O 列
 * 字段 key 与导入 Skill（skills/solyn-skill-fa-*-import）的列映射一一对应。
 */
export const FA_STATUS = ["未着手／未开始", "進行中／进行中", "完了／已完成", "保留／暂缓", "中止／取消"];
export const DD_STATUS = ["未请求／未依頼", "已请求／依頼済", "部分接收／一部受領", "已接收／受領済", "不适用／該当なし"];

export const DD_CATEGORIES = [
  "1. 公司基本·组织\n1. 会社基礎・組織", "2. 财务·会计\n2. 財務・会計", "3. 事业·营业\n3. 事業・営業", "4. 资产·不动产\n4. 資産・不動産",
  "5. 人事·劳务\n5. 人事・労務", "6. 法务·合规\n6. 法務・コンプライアンス", "7. IT·系统\n7. IT・システム", "8. 交易专用\n8. 本件固有（ディール専用）", "9. 出租车业专项\n9. タクシー事業固有",
];
export const DD_CAT_CODES = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9"];

export const QA_STATUS = ["未答复", "待跟踪", "已解决", "已无效"];
export const QA_GROUP_OPTIONS = ["ADM", "SEL", "EXC", "DD"];

export const DEFAULT_FIELDS: Record<TrackerModuleKey, Tpl[]> = {
  fa: [
    { key: "code", label: "任务编号", type: "text", role: "code", width: 96, required: true, aliases: ["No.", "No", "编号", "タスクNo."] },
    { key: "phase", label: "Phase", type: "select", options: ["Phase 0", "Phase 1", "Phase 2", "Phase 3", "Phase 4", "Phase 5", "Phase 6", "Phase 7"], width: 90 },
    { key: "stage", label: "阶段／フェーズ", type: "select", role: "category", width: 150, aliases: ["阶段", "フェーズ"],
      options: ["启动·受任\n着手・受任", "准备\n準備", "寻找买家·接触\nマッチング・打診", "意向表明〜基本协议\n意向表明〜基本合意", "尽职调查\nデューデリジェンス", "最终谈判〜签约\n最終交渉〜契約締結", "交割\nクロージング", "交割后·项目收尾\nPMI・案件クローズ"] },
    { key: "level", label: "任务等级", type: "select", role: "priority", options: ["阶段任务", "一级任务", "二级任务"], width: 96, aliases: ["任务级别", "等级"],
      config: { levelParents: { 阶段任务: null, 一级任务: "阶段任务", 二级任务: "一级任务" } } },
    { key: "parent_code", label: "上级任务", type: "text", formula: "fa_parent_code", width: 96, aliases: ["上级任务编号"] },
    { key: "task", label: "任务／タスク", type: "longtext", role: "title", required: true, width: 380, aliases: ["任务", "タスク"] },
    { key: "owner", label: "担当", type: "text", role: "owner", width: 130, aliases: ["负责方", "担当者", "负责人"] },
    { key: "start_offset", label: "開始 D+", type: "number", width: 76, aliases: ["開始D+", "开始D+", "開始\nD+"] },
    { key: "duration", label: "所要日数", type: "number", width: 76, aliases: ["所要\n日数", "所需天数"] },
    { key: "plan_start", label: "計画開始日", type: "date", role: "start_date", formula: "fa_plan_start", width: 112, aliases: ["计划开始日"] },
    { key: "plan_end", label: "計画完了日", type: "date", role: "due_date", formula: "fa_plan_end", width: 112, aliases: ["计划完成日"] },
    { key: "actual_start", label: "実績開始日", type: "date", width: 112, aliases: ["实际开始日"] },
    { key: "actual_end", label: "実績完了日", type: "date", width: 112, aliases: ["实际完成日"] },
    { key: "status", label: "ステータス", type: "select", role: "status", options: FA_STATUS, width: 130, aliases: ["状态", "状態"] },
    { key: "progress", label: "進捗率", type: "percent", role: "progress", width: 100, aliases: ["进度", "完成度"] },
    { key: "delay_days", label: "遅延日数", type: "number", formula: "fa_delay_days", width: 80, aliases: ["遅延\n日数", "延迟天数"] },
    { key: "deliverable", label: "成果物／交付物", type: "text", width: 160, aliases: ["成果物", "交付物"] },
    { key: "notes", label: "本案の留意点", type: "longtext", width: 320, aliases: ["留意点", "本案の留意点（タクシー事業・クロスボーダー）", "注意事项"] },
    { key: "ref_docs", label: "関連資料No.", type: "text", width: 90, aliases: ["関連\n資料No.", "相关资料No."] },
  ],
  dd: [
    { key: "prefix_code", label: "材料前缀编码", type: "text", role: "code", formula: "dd_code", width: 130, required: true, aliases: ["前缀编码", "材料编码"] },
    { key: "cat_code", label: "分类编码", type: "select", width: 76, required: true, options: DD_CAT_CODES, aliases: ["分类代码"] },
    { key: "category", label: "材料分类名称", type: "select", role: "category", width: 150, aliases: ["大分类／大分類", "大分类", "大分類", "分类名称"], options: DD_CATEGORIES },
    { key: "major_code", label: "大类代码", type: "text", width: 72, required: true, aliases: ["大类编码"] },
    { key: "minor_code", label: "中类代码", type: "text", width: 72, required: true, aliases: ["中类编码"] },
    { key: "seq", label: "顺序码", type: "number", width: 64, aliases: ["顺序号", "序号"] },
    { key: "item", label: "资料名称／資料名", type: "longtext", role: "title", required: true, width: 360, aliases: ["资料名称", "資料名"] },
    { key: "period", label: "对象期间／対象期間", type: "text", width: 130, aliases: ["对象期间", "対象期間"] },
    { key: "necessity", label: "必要度", type: "select", role: "priority", options: ["必须／必須", "适用时／該当時", "可选／任意"], width: 110 },
    { key: "status", label: "提出状态／提出ステータス", type: "select", role: "status", options: DD_STATUS, width: 140, aliases: ["提出状态", "提出ステータス", "状态"] },
    { key: "request_date", label: "请求日／依頼日", type: "date", role: "start_date", width: 112, aliases: ["请求日", "依頼日"] },
    { key: "received_date", label: "接收日／受領日", type: "date", width: 112, aliases: ["接收日", "受領日"] },
    { key: "provider", label: "提供者·担当／提供者・担当", type: "text", role: "owner", width: 130, aliases: ["提供者", "担当", "提供者·担当"] },
    { key: "location", label: "保存位置·文件名／保存場所・ファイル名", type: "text", width: 200, aliases: ["保存位置", "保存場所", "文件名"] },
    { key: "remark", label: "备注／備考", type: "longtext", width: 320, aliases: ["备注", "備考"] },
    { key: "related_task", label: "关联任务／関連タスク", type: "text", width: 96, aliases: ["关联任务", "関連タスク", "关联任务编号", "任务编号"] },
    { key: "revision", label: "变更／改訂", type: "select", options: ["新規追加 v3／v3新增", "内容改訂 v3／v3修订", "新規追加 v4／v4新增"], width: 140, aliases: ["变更", "改訂"] },
  ],
  // 《QA问答进度跟踪表 List v1》「Q&A」A〜M 列
  qa: [
    { key: "code", label: "编号", type: "text", role: "code", width: 64, aliases: ["#", "No.", "No", "序号", "问题编号"] },
    { key: "access_group", label: "权限组", type: "select", role: "access", options: QA_GROUP_OPTIONS, width: 76, aliases: ["权限", "閲覧権限", "Access"] },
    { key: "stage", label: "项目阶段", type: "text", role: "category", width: 88, aliases: ["阶段", "任务编号", "フェーズ"] },
    { key: "asker", label: "提问者", type: "select", options: ["SOLYN FA"], width: 100, aliases: ["提问方", "質問者"] },
    { key: "question", label: "提问内容", type: "longtext", role: "title", required: true, width: 380, aliases: ["问题", "質問内容", "质问内容"] },
    { key: "purpose", label: "确认目的与论点", type: "longtext", width: 300, aliases: ["确认目的", "論点", "目的与论点", "確認目的と論点"] },
    { key: "status", label: "回复状态", type: "select", role: "status", options: QA_STATUS, width: 96, aliases: ["状态", "回答状況", "回复状况"] },
    { key: "respondent", label: "提问对象", type: "select", role: "owner", options: ["CEO"], width: 96, aliases: ["回答者", "回复方", "質問先"] },
    { key: "answer", label: "回答记录", type: "longtext", width: 340, aliases: ["回答", "答复", "回答内容", "回答記録"] },
    { key: "remark", label: "备注", type: "longtext", width: 200, aliases: ["備考"] },
    { key: "interview_ref", label: "关联访谈记录", type: "text", width: 150, aliases: ["访谈记录", "関連面談記録"] },
    { key: "material_ref", label: "关联材料", type: "text", width: 130, aliases: ["关联材料编码", "材料编码", "関連資料"] },
    { key: "update_date", label: "更新日期", type: "date", width: 104, aliases: ["更新日", "更新日付"] },
  ],
};

/** 把用户输入的显示名转成安全的机器键 */
export function slugKey(label: string, existing: string[]): string {
  let base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!base) base = "f";
  let key = base;
  let i = 2;
  while (existing.includes(key)) key = `${base}_${i++}`;
  if (/^[0-9]/.test(key)) key = "f_" + key;
  return key;
}

/** 根据字段类型把表单/Excel 原值规范化 */
export function normalizeValue(type: FieldType, raw: unknown): unknown {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  switch (type) {
    case "number":
    case "percent": {
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[,%\s]/g, ""));
      if (!Number.isFinite(n)) return null;
      // 百分比统一存 0–100；Excel 中 0–1 的小数由导入 Skill 按单元格格式换算
      return n;
    }
    case "date": {
      if (raw instanceof Date) return raw.toISOString().slice(0, 10);
      const s = String(raw).trim().replace(/[./年月]/g, "-").replace(/日/, "");
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    case "boolean":
      if (typeof raw === "boolean") return raw;
      return ["true", "1", "是", "y", "yes", "on"].includes(String(raw).toLowerCase());
    case "multiselect":
      if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
      return String(raw).split(/[,，、;；]/).map((s) => s.trim()).filter(Boolean);
    default:
      return String(raw);
  }
}

export function displayValue(type: string, v: unknown, users?: Map<string, string>): string {
  if (v === null || v === undefined || v === "") return "";
  if (type === "percent") return `${v}%`;
  if (type === "boolean") return v ? "是" : "否";
  if (type === "multiselect" && Array.isArray(v)) return v.join("、");
  if (type === "user" && users) return users.get(String(v)) ?? String(v);
  return String(v);
}

export function isEqualValue(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
