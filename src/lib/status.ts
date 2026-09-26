/**
 * 状态语义识别：兼容中日双语下拉值（如「完了／已完成」「已接收／受領済」「不适用／該当なし」）。
 * done     = 已完成 / 已接收
 * excluded = 不适用 / 中止取消（不计入完成率分母）
 */
export type StatusKind = "done" | "excluded" | "hold" | "partial" | "progress" | "todo" | "empty";

export function statusKind(v: unknown): StatusKind {
  const s = String(v ?? "").trim();
  if (!s) return "empty";
  if (/不适用|該当なし|不適用|中止|取消|cancel|n\/a/i.test(s)) return "excluded";
  if (/已完成|完了|已接收|受領済|已提供|提供済|^完成$|^done$|completed|closed/i.test(s)) return "done";
  if (/保留|暂缓|暂停|挂起|on hold/i.test(s)) return "hold";
  if (/部分|一部/.test(s)) return "partial";
  if (/进行|進行|已请求|依頼済|处理|跟进|in progress/i.test(s)) return "progress";
  return "todo";
}

export const isDone = (v: unknown) => statusKind(v) === "done";
export const isExcluded = (v: unknown) => statusKind(v) === "excluded";
