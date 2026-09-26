/**
 * FA 任务从属关系
 *
 * 任务编号规则（Project Aoyama 模板）：
 *   P0-00    → Phase 0 的阶段任务（顶级）
 *   P0-01    → 一级任务，上级 = P0-00
 *   P0-02.1  → 二级任务，上级 = P0-02
 *   P0-02.1.3→ 三级任务，上级 = P0-02.1（如在等级中配置了第四级）
 *
 * 任务等级之间的从属关系在「项目管理 → FA 任务字段 → 任务等级」中配置（config.levelParents）。
 */

export const DEFAULT_LEVEL_PARENTS: Record<string, string | null> = { 阶段任务: null, 一级任务: "阶段任务", 二级任务: "一级任务" };

const RE = /^([A-Za-z]+\d+)-(\d+)((?:\.\d+)*)$/;

export function parseCode(code: unknown) {
  const s = String(code ?? "").trim().normalize("NFKC");
  const m = s.match(RE);
  if (!m) return null;
  const [, prefix, main, rest] = m;
  const subs = rest ? rest.slice(1).split(".") : [];
  const isPhase = /^0+$/.test(main) && subs.length === 0;
  let depth = isPhase ? 0 : 1 + subs.length;
  let parent: string | null;
  if (isPhase) parent = null;
  else if (subs.length === 0) parent = `${prefix}-${"0".repeat(Math.max(2, main.length))}`;
  else parent = `${prefix}-${main}${subs.length > 1 ? "." + subs.slice(0, -1).join(".") : ""}`;
  return { prefix, depth, parent, normalized: s };
}

export function parentCodeOf(code: unknown) {
  return parseCode(code)?.parent ?? null;
}

/** 等级 → 深度（0 = 顶级），按 levelParents 链计算 */
export function levelDepthMap(parents: Record<string, string | null>) {
  const out: Record<string, number> = {};
  for (const lv of Object.keys(parents)) {
    let d = 0;
    let cur: string | null | undefined = parents[lv];
    const seen = new Set([lv]);
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      d++;
      cur = parents[cur];
    }
    out[lv] = d;
  }
  return out;
}

/** 按编号深度推断任务等级（用于新增任务时自动填写） */
export function levelForDepth(parents: Record<string, string | null>, depth: number) {
  const dm = levelDepthMap(parents);
  return Object.keys(dm).find((k) => dm[k] === depth) ?? null;
}

export function getLevelParents(config: { levelParents?: Record<string, string | null> } | null | undefined, options: string[]) {
  const p = config?.levelParents;
  if (p && Object.keys(p).length) return p;
  const def: Record<string, string | null> = {};
  for (const o of options) def[o] = o in DEFAULT_LEVEL_PARENTS ? DEFAULT_LEVEL_PARENTS[o] : null;
  return def;
}

export type HierarchyIssue = string | null;

/**
 * 校验一条任务的从属关系：
 *  1. 编号能否解析；2. 上级任务是否存在；3. 上级任务的等级是否等于本等级配置的上级等级；4. 编号层级与等级是否一致
 */
export function checkHierarchy(
  code: unknown, level: unknown, parents: Record<string, string | null>,
  lookup: (code: string) => { level: unknown } | undefined,
): HierarchyIssue {
  const pc = parseCode(code);
  const lv = level ? String(level) : "";
  if (!pc) return code ? `任务编号「${code}」不符合 P0-00 / P0-01 / P0-01.1 格式，无法判断从属关系` : null;
  if (!lv) return null;
  if (!(lv in parents)) return `任务等级「${lv}」未在从属关系中配置`;
  const expectedParentLevel = parents[lv];
  const dm = levelDepthMap(parents);
  if (dm[lv] !== pc.depth) {
    const want = levelForDepth(parents, pc.depth);
    return `编号 ${pc.normalized} 对应的等级应为「${want ?? `第 ${pc.depth + 1} 级`}」，当前为「${lv}」`;
  }
  if (!expectedParentLevel) return null;
  const parent = pc.parent ? lookup(pc.parent) : undefined;
  if (!parent) return `上级任务 ${pc.parent} 不存在（${lv}应从属于${expectedParentLevel}）`;
  if (String(parent.level ?? "") !== expectedParentLevel) return `上级任务 ${pc.parent} 的等级为「${parent.level ?? "未填写"}」，${lv}应从属于「${expectedParentLevel}」`;
  return null;
}
