/**
 * 任务编号自然排序：按字母从小到大，数字段按数值比较
 * P0-00 < P0-01 < P0-02 < P0-02.1 < P0-02.2 < P0-03 < … < P1-00 < … < P10-00
 */
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function compareCode(a: unknown, b: unknown) {
  const x = a === null || a === undefined ? "" : String(a).trim();
  const y = b === null || b === undefined ? "" : String(b).trim();
  if (!x && !y) return 0;
  if (!x) return 1; // 无编号的排在最后
  if (!y) return -1;
  return collator.compare(x, y);
}

export function sortByCode<T extends { data: Record<string, unknown>; seq?: number }>(items: T[], codeKey?: string) {
  if (!codeKey) return items;
  return [...items].sort((a, b) => compareCode(a.data[codeKey], b.data[codeKey]) || (a.seq ?? 0) - (b.seq ?? 0));
}
