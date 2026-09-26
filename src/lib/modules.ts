export type ModuleKey = "home" | "fa" | "dd" | "fdd" | "qa" | "vdr";
export type TrackerModuleKey = "fa" | "dd";

export type ModuleDef = {
  key: ModuleKey;
  label: string;
  en: string;
  desc: string;
  ready: boolean; // 是否已开发
  tracker?: boolean;
};

export const MODULES: ModuleDef[] = [
  { key: "home", label: "项目首页", en: "Overview", desc: "FA 与 DD 的核心指标 Dashboard", ready: true },
  { key: "fa", label: "FA项目管理", en: "Deal Workplan", desc: "交易全流程任务计划与进度跟踪", ready: true, tracker: true },
  { key: "dd", label: "DD管理", en: "Due Diligence", desc: "尽调材料与信息收集进度跟踪", ready: true, tracker: true },
  { key: "fdd", label: "FDD管理", en: "Financial DD", desc: "财务尽调工作底稿与问题清单", ready: false },
  { key: "qa", label: "Q&A管理", en: "Q&A Log", desc: "买卖双方问答记录与答复跟踪", ready: false },
  { key: "vdr", label: "VDR", en: "Virtual Data Room", desc: "虚拟数据室：Phase 区、分级权限、访问留痕与分析", ready: true },
];

export const TRACKER_MODULES: TrackerModuleKey[] = ["fa", "dd"];

export function moduleDef(key: string) {
  return MODULES.find((m) => m.key === key);
}

export function isTrackerModule(key: string): key is TrackerModuleKey {
  return key === "fa" || key === "dd";
}
