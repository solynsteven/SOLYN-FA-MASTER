"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, History, FileText, ListTree, AlertTriangle } from "lucide-react";
import type { HierInfo } from "./useHierarchy";
import { checkHierarchy, levelForDepth, parentCodeOf, parseCode } from "@/lib/hierarchy";
import { Alert, ConfirmButton, Drawer, cn, useAction } from "@/components/ui";
import { FieldInput } from "./FieldInput";
import { displayValue, isEqualValue } from "@/lib/fields";
import { fmtDateTime } from "@/lib/format";
import type { ActionResult } from "@/lib/action";
import { FORMULAS } from "@/lib/formulas";
import type { TField, TItem, TMember } from "./types";
import { createItemAction, updateItemAction, deleteItemsAction, itemHistoryAction } from "@/app/p/[projectId]/[module]/actions";

type H = { id: string; action: string; source: string; changes: Record<string, { from: unknown; to: unknown }>; actor: string; at: string };

const ACTION: Record<string, string> = { create: "新增", update: "修改", delete: "删除", restore: "恢复" };

export function ItemDrawer({
  projectId, moduleKey, fields, item, members, canManage, onClose, titleLabel, hierarchy: H, onOpenItem,
}: {
  projectId: string; moduleKey: string; fields: TField[]; item: TItem | null; members: TMember[]; canManage: boolean;
  onClose: () => void; titleLabel: string; hierarchy?: HierInfo; onOpenItem?: (it: TItem) => void;
}) {
  const router = useRouter();
  const isNew = !item;
  const [tab, setTab] = useState<"detail" | "history">("detail");
  const [data, setData] = useState<Record<string, unknown>>(item?.data ?? {});
  const [hist, setHist] = useState<H[] | null>(null);
  const save = useAction();
  const del = useAction();
  const h = useAction();
  const users = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);
  const titleField = fields.find((f) => f.role === "title");
  const codeField = fields.find((f) => f.role === "code");
  const editable = fields.filter((f) => !f.formula);
  const dirty = editable.some((f) => !isEqualValue(item?.data[f.key] ?? null, data[f.key] ?? null));

  // —— 从属关系 ——
  const codeF = codeField;
  const levelF = fields.find((f) => f.role === "priority");
  const hier = H?.enabled && codeF && levelF ? H : null;
  const curCode = codeF ? String(data[codeF.key] ?? "").trim() : "";
  const parentCode = hier ? parentCodeOf(curCode) : null;
  const parentItem = parentCode ? hier!.byCode.get(parentCode) : undefined;
  const childItems = hier && item ? hier.childrenOf(H!.codeOf(item)) : [];
  const liveIssue = hier
    ? checkHierarchy(curCode, data[levelF!.key], hier.parents, (c) => {
        const x = hier.byCode.get(c);
        return x && x.id !== item?.id ? { level: x.data[levelF!.key] } : undefined;
      })
    : null;
  const expectedParentLevel = hier && data[levelF!.key] ? hier.parents[String(data[levelF!.key])] : undefined;
  const titleOf = (it: TItem) => String((titleField && it.data[titleField.key]) || "").split("\n")[0];
  function setField(k: string, v: unknown) {
    setData((d) => {
      const n = { ...d, [k]: v };
      // 输入任务编号时，若任务等级为空则按编号层级自动填写
      if (hier && k === codeF!.key && !d[levelF!.key]) {
        const pc = parseCode(v);
        const lv = pc ? levelForDepth(hier.parents, pc.depth) : null;
        if (lv) n[levelF!.key] = lv;
      }
      return n;
    });
  }

  function openTab(k: "detail" | "history") {
    setTab(k);
    if (k === "history" && item && hist === null && !h.pending) {
      h.exec(() => itemHistoryAction(projectId, moduleKey, item.id), (r) => setHist((r.data as H[]) ?? []));
    }
  }

  const title = isNew ? `新增${titleLabel}` : String((titleField && item.data[titleField.key]) || `#${item.seq}`);
  const subtitle = isNew
    ? "填写后保存；新增时间将被自动记录"
    : `${codeField && item.data[codeField.key] ? `${item.data[codeField.key]} · ` : ""}#${item.seq} · 最后更新 ${fmtDateTime(item.updatedAt)}${item.updatedByName ? ` · ${item.updatedByName}` : ""}`;

  function submit() {
    // 只提交有变化的字段，确保每个字段的“更新日期”准确
    const payload: Record<string, unknown> = {};
    for (const f of editable) {
      const nv = data[f.key] ?? null;
      if (isNew ? nv !== null && nv !== "" : !isEqualValue(item.data[f.key] ?? null, nv)) payload[f.key] = nv;
    }
    save.exec(
      async (): Promise<ActionResult<unknown>> => (isNew ? createItemAction(projectId, moduleKey, payload) : updateItemAction(projectId, moduleKey, item.id, payload)),
      () => {
        router.refresh();
        onClose();
      },
    );
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width={620}
      title={title}
      subtitle={subtitle}
      footer={
        tab === "detail" && (
          <>
            {!isNew && canManage && (
              <ConfirmButton
                className="btn-danger mr-auto"
                title="删除记录"
                confirmText="删除"
                body={`${childItems.length ? `该任务有 ${childItems.length} 个下级任务，删除后它们将失去上级（不会一并删除）。` : ""}删除后该记录从跟踪表中移除，删除日期与操作人会被记录；管理员可在「变更记录」中恢复。`}
                onConfirm={() => del.exec(() => deleteItemsAction(projectId, moduleKey, [item.id]), () => { router.refresh(); onClose(); })}
              >
                <Trash2 size={14} />删除
              </ConfirmButton>
            )}
            <button className="btn-secondary" onClick={onClose}>{canManage ? "取消" : "关闭"}</button>
            {canManage && (
              <button className="btn-primary" disabled={save.pending || (!isNew && !dirty)} onClick={submit}>
                {save.pending ? "保存中…" : isNew ? "新增" : "保存修改"}
              </button>
            )}
          </>
        )
      }
    >
      {!isNew && (
        <div className="flex gap-1 border-b border-line px-5">
          {([["detail", "详情", FileText], ["history", "变更记录", History]] as const).map(([k, l, Icon]) => (
            <button
              key={k}
              onClick={() => openTab(k)}
              className={cn("-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs transition", tab === k ? "border-brand-sage text-brand-paper" : "border-transparent text-brand-sage hover:text-brand-mist")}
            >
              <Icon size={13} />{l}
            </button>
          ))}
        </div>
      )}
      {tab === "detail" ? (
        <div className="space-y-4 p-5">
          {!canManage && <Alert kind="info">您是项目用户，可查看记录；新增、修改与删除需项目管理员权限。</Alert>}
          {hier && (
            <div className="rounded-md border border-line bg-ink-950/40 p-3 text-xs">
              <div className="mb-2 flex items-center gap-1.5 text-brand-mist"><ListTree size={13} className="text-brand-sage" />从属关系</div>
              <div className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-1.5">
                <span className="text-brand-sage">上级任务</span>
                <span>
                  {!parentCode ? (
                    <span className="text-brand-sage">{curCode ? "无（顶级任务）" : "输入任务编号后自动识别"}</span>
                  ) : parentItem ? (
                    <button className="text-left text-brand-paper hover:underline" onClick={() => onOpenItem?.(parentItem)}>
                      <span className="font-num">{parentCode}</span>　{titleOf(parentItem)}
                      <span className="ml-1.5 text-brand-sage">（{String(parentItem.data[levelF!.key] ?? "")}）</span>
                    </button>
                  ) : (
                    <span className="text-warn"><span className="font-num">{parentCode}</span> 尚不存在</span>
                  )}
                </span>
                {expectedParentLevel !== undefined && (
                  <>
                    <span className="text-brand-sage">等级规则</span>
                    <span className="text-brand-sage">{String(data[levelF!.key])} {expectedParentLevel ? `从属于「${expectedParentLevel}」` : "为顶级，无上级"}</span>
                  </>
                )}
                {childItems.length > 0 && (
                  <>
                    <span className="text-brand-sage">下级任务</span>
                    <span className="space-y-0.5">
                      {childItems.map((c) => (
                        <button key={c.id} className="block text-left text-brand-mist hover:text-brand-paper hover:underline" onClick={() => onOpenItem?.(c)}>
                          <span className="font-num">{H!.codeOf(c)}</span>　{titleOf(c)}
                        </button>
                      ))}
                    </span>
                  </>
                )}
              </div>
              {liveIssue && <div className="mt-2 flex items-start gap-1.5 text-warn"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{liveIssue}</div>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            {fields.map((f) => {
              const wide = f.type === "longtext" || f.type === "multiselect" || f.role === "title";
              const upd = item?.fieldUpdatedAt?.[f.key];
              return (
                <div key={f.id} className={wide ? "col-span-2" : ""}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <label className="text-xs font-medium text-brand-mist/80">
                      {f.label}{f.required && <span className="ml-0.5 text-danger">*</span>}
                    </label>
                    {f.formula ? (
                      <span className="text-[10px] text-brand-sage/80" title={FORMULAS[f.formula]?.desc}>自动计算</span>
                    ) : (
                      upd && <span className="font-num text-[10px] text-brand-sage/80" title="该字段最近一次更新时间">更新于 {fmtDateTime(upd)}</span>
                    )}
                  </div>
                  {f.formula ? (
                    <div className="rounded-md border border-dashed border-line-strong bg-ink-950/40 px-3 py-2 font-num text-sm text-brand-mist" title={FORMULAS[f.formula]?.desc}>
                      {isNew ? "保存后计算" : displayValue(f.type, item.data[f.key]) || "—"}
                    </div>
                  ) : (
                    <FieldInput f={f} value={data[f.key]} disabled={!canManage} members={members} onChange={(v) => setField(f.key, v)} />
                  )}
                </div>
              );
            })}
          </div>
          <Alert>{save.error || del.error}</Alert>
          {item && (
            <div className="border-t border-line pt-3 text-2xs text-brand-sage">
              创建于 <span className="font-num">{fmtDateTime(item.createdAt)}</span> · 最后更新 <span className="font-num">{fmtDateTime(item.updatedAt)}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="p-5">
          <Alert>{h.error}</Alert>
          {hist === null ? (
            <div className="py-10 text-center text-xs text-brand-sage">加载中…</div>
          ) : hist.length === 0 ? (
            <div className="py-10 text-center text-xs text-brand-sage">暂无变更记录</div>
          ) : (
            <ol className="relative space-y-5 border-l border-line pl-5">
              {hist.map((e) => (
                <li key={e.id} className="relative">
                  <span className={cn("absolute -left-[25px] top-1 h-2 w-2 rounded-full", e.action === "delete" ? "bg-danger" : e.action === "create" ? "bg-brand-sage" : "bg-brand-mid")} />
                  <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="font-medium text-brand-paper">{ACTION[e.action] ?? e.action}</span>
                    {e.source === "import" && <span className="rounded border border-line-strong px-1 text-[10px] text-brand-sage">Excel 导入</span>}
                    <span className="text-brand-sage">{e.actor}</span>
                    <span className="font-num text-brand-sage/80">{fmtDateTime(e.at)}</span>
                  </div>
                  {Object.keys(e.changes).length > 0 && e.action !== "delete" && (
                    <div className="mt-2 space-y-1 rounded-md border border-line bg-ink-950/60 p-2.5">
                      {Object.entries(e.changes).map(([k, c]) => {
                        const f = fields.find((x) => x.key === k);
                        const fmt = (x: unknown) => displayValue(f?.type ?? "text", x, users) || "（空）";
                        return (
                          <div key={k} className="grid grid-cols-[96px_1fr] gap-2 text-xs">
                            <span className="truncate text-brand-sage">{f?.label ?? k}</span>
                            <span className="min-w-0 break-words">
                              {e.action === "update" && <><span className="text-brand-sage/70 line-through decoration-brand-sage/40">{fmt(c.from)}</span><span className="mx-1.5 text-brand-sage">→</span></>}
                              <span className="text-brand-mist">{fmt(c.to)}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Drawer>
  );
}
