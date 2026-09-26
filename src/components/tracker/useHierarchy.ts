"use client";

import { useMemo } from "react";
import { checkHierarchy, getLevelParents, levelDepthMap, parentCodeOf, parseCode } from "@/lib/hierarchy";
import { statusKind } from "@/lib/status";
import type { TField, TItem } from "./types";

export type HierInfo = {
  enabled: boolean;
  parents: Record<string, string | null>;
  depthOf: (it: TItem) => number;
  issueOf: (it: TItem) => string | null;
  childrenOf: (code: string) => TItem[];
  rollup: (code: string) => { total: number; done: number; excluded: number };
  byCode: Map<string, TItem>;
  ancestors: (code: string) => string[];
  codeOf: (it: TItem) => string;
};

/** FA 任务从属关系：深度、上下级、校验问题、下级汇总 */
export function useHierarchy(moduleKey: string, fields: TField[], items: TItem[]): HierInfo {
  return useMemo(() => {
    const codeF = fields.find((f) => f.role === "code");
    const levelF = fields.find((f) => f.role === "priority");
    const statusF = fields.find((f) => f.role === "status");
    const enabled = moduleKey === "fa" && !!codeF && !!levelF;
    const parents = levelF ? getLevelParents(levelF.config, levelF.options) : {};
    const dm = levelDepthMap(parents);
    const codeOf = (it: TItem) => String((codeF && it.data[codeF.key]) ?? "").trim();
    const byCode = new Map(items.map((i) => [codeOf(i), i]));
    const kids = new Map<string, TItem[]>();
    for (const it of items) {
      const p = parentCodeOf(codeOf(it));
      if (p) (kids.get(p) ?? kids.set(p, []).get(p)!).push(it);
    }
    const issues = new Map<string, string | null>();
    if (enabled)
      for (const it of items)
        issues.set(it.id, checkHierarchy(codeOf(it), it.data[levelF!.key], parents, (c) => {
          const x = byCode.get(c);
          return x ? { level: x.data[levelF!.key] } : undefined;
        }));
    const rollCache = new Map<string, { total: number; done: number; excluded: number }>();
    const rollup = (code: string): { total: number; done: number; excluded: number } => {
      if (rollCache.has(code)) return rollCache.get(code)!;
      const r = { total: 0, done: 0, excluded: 0 };
      for (const c of kids.get(code) ?? []) {
        const k = statusKind(statusF ? c.data[statusF.key] : null);
        r.total++;
        if (k === "done") r.done++;
        if (k === "excluded") r.excluded++;
        const sub = rollup(codeOf(c));
        r.total += sub.total; r.done += sub.done; r.excluded += sub.excluded;
      }
      rollCache.set(code, r);
      return r;
    };
    const ancestors = (code: string) => {
      const out: string[] = [];
      let p = parentCodeOf(code);
      while (p && out.length < 10) { out.push(p); p = parentCodeOf(p); }
      return out;
    };
    return {
      enabled, parents, byCode, codeOf, ancestors, rollup,
      depthOf: (it) => {
        const lv = levelF ? String(it.data[levelF.key] ?? "") : "";
        if (lv && lv in dm) return dm[lv];
        return parseCode(codeOf(it))?.depth ?? 1;
      },
      issueOf: (it) => issues.get(it.id) ?? null,
      childrenOf: (code) => kids.get(code) ?? [],
    };
  }, [moduleKey, fields, items]);
}
