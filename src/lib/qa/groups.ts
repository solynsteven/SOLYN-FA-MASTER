/**
 * Q&A 权限组：逐级放大 ADM > SEL > EXC > DD。
 * 记录 / 文件区标注为某一组时，该组及以上各组可见。
 * BID1 / BID2 等不在体系内的成员看不到 Q&A 模块。
 */
export const QA_GROUPS = ["ADM", "SEL", "EXC", "DD"] as const;
export type QaGroup = (typeof QA_GROUPS)[number];

export const QA_RANK: Record<QaGroup, number> = { ADM: 4, SEL: 3, EXC: 2, DD: 1 };

export const QA_GROUP_META: Record<QaGroup, { label: string; desc: string }> = {
  ADM: { label: "ADM", desc: "卖方 FA（管理员）" },
  SEL: { label: "SEL", desc: "卖方及其顾问" },
  EXC: { label: "EXC", desc: "独家谈判对象" },
  DD: { label: "DD", desc: "买方尽调顾问" },
};

export function isQaGroup(v: unknown): v is QaGroup {
  return typeof v === "string" && (QA_GROUPS as readonly string[]).includes(v);
}

/** 记录所需等级：未填写 / 无法识别时按最严格的 ADM 处理 */
export function requiredRank(group: unknown) {
  const g = String(group ?? "").trim().toUpperCase();
  return isQaGroup(g) ? QA_RANK[g] : QA_RANK.ADM;
}

export function canSee(viewerRank: number, group: unknown) {
  return viewerRank > 0 && viewerRank >= requiredRank(group);
}

/** 某权限组「及以上」可见的描述 */
export function audienceText(group: unknown) {
  const g = String(group ?? "").trim().toUpperCase();
  const r = requiredRank(g);
  return QA_GROUPS.filter((x) => QA_RANK[x] >= r).join(" / ");
}
