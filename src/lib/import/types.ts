import type { Cell } from "./excel";

/** 一个导入 Skill 的确定性规则（与 skills/<name>/SKILL.md 描述一致） */
export type ImportSkill = {
  name: string; // solyn-skill-fa-pm-import
  moduleKey: "fa" | "dd";
  title: string;
  /** 优先匹配的工作表名 */
  preferredSheets: string[];
  /** 用于识别表头行的关键词（出现越多越可能是表头） */
  headerHints: string[];
  /** 从表头上方区域提取的元数据（如项目开始日） */
  meta?: { key: "startDate"; labels: string[] }[];
  /** 单元格级特殊规则：返回 undefined 表示走默认处理 */
  cellRule?: (fieldKey: string, value: unknown, cell: Cell) => unknown | undefined;
  /** 判断一行是否为数据行 */
  isDataRow?: (vals: Record<string, unknown>) => boolean;
};

export type ColumnMap = { col: number; header: string; fieldKey: string | null; fieldLabel?: string; how: "exact" | "alias" | "fuzzy" | "claude" | "computed" | "none" };

export type ParsedRow = { rowNo: number; code: string; data: Record<string, unknown> };

export type ImportPreview = {
  batchId: string;
  fileName: string;
  sheetName: string;
  headerRow: number;
  columns: ColumnMap[];
  meta: { startDate?: string | null };
  currentStartDate?: string | null;
  counts: { rows: number; create: number; update: number; unchanged: number; delete: number; warnings: number };
  creates: { code: string; title: string }[];
  updates: { code: string; title: string; changes: { field: string; from: string; to: string }[] }[];
  deletes: { code: string; title: string }[];
  warnings: string[];
  newOptions: { field: string; values: string[] }[];
  newFields: string[];
  usedClaude: boolean;
};

export type BatchPayload = {
  creates: { code: string; data: Record<string, unknown> }[];
  updates: { itemId: string; code: string; patch: Record<string, unknown> }[];
  deletes: { itemId: string; code: string }[];
  newOptions: Record<string, string[]>;
  newFields: { label: string; col: number }[];
  newFieldValues: Record<string, Record<string, unknown>>; // code -> { label: value }
  meta: { startDate?: string | null };
};
