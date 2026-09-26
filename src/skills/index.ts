import type { ImportSkill } from "@/lib/import/types";
import { fillColor } from "@/lib/import/excel";

/**
 * solyn-skill-fa-pm-import —— 《项目管理进度表》（Sell-side M&A 進捗管理表）
 * 规则说明见 skills/solyn-skill-fa-pm-import/SKILL.md
 */
export const faPmImport: ImportSkill = {
  name: "solyn-skill-fa-pm-import",
  moduleKey: "fa",
  title: "项目管理进度表",
  preferredSheets: [],
  headerHints: ["No.", "Phase", "阶段", "任务等级", "任务", "タスク", "担当", "計画開始日", "計画完了日", "ステータス", "進捗率", "成果物"],
  meta: [{ key: "startDate", labels: ["プロジェクト開始日", "项目开始日", "Project Start"] }],
  isDataRow: (v) => !!(v.code || v.task),
};

/**
 * solyn-skill-fa-dd-import —— 《DD材料信息收集进度表》（資料依頼リスト）
 * 规则说明见 skills/solyn-skill-fa-dd-import/SKILL.md
 */
export const ddImport: ImportSkill = {
  name: "solyn-skill-fa-dd-import",
  moduleKey: "dd",
  title: "DD材料信息收集进度表",
  preferredSheets: ["資料依頼リスト", "资料请求清单", "DD List"],
  headerHints: ["No.", "材料前缀编码", "大分类", "大类编码", "中类编码", "资料名称", "对象期间", "必要度", "提出状态", "请求日", "接收日", "提供者", "备注"],
  cellRule: (key, value, cell) => {
    // L/O 列「变更／改訂」：v3 新增的行只有绿色底纹、没有文字 → 按凡例补全
    if (key === "revision" && (value === null || value === "")) {
      const c = fillColor(cell);
      if (c === "FFE2EFDA") return "新規追加 v3／v3新增";
    }
    return undefined;
  },
  isDataRow: (v) => v.no !== null && v.no !== undefined && v.no !== "" && !!v.item,
};

export const IMPORT_SKILLS = { fa: faPmImport, dd: ddImport } as const;
