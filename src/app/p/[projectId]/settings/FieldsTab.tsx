"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ArrowUp, ArrowDown, Pencil, Trash2, RotateCcw, Eye, EyeOff } from "lucide-react";
import { Alert, Badge, ConfirmButton, Modal, Toggle, useAction } from "@/components/ui";
import { FIELD_TYPES, FIELD_ROLES, fieldTypeLabel, hasOptions } from "@/lib/fields";
import type { FieldType, FieldRole } from "@/db/schema";
import { FORMULAS } from "@/lib/formulas";
import { getLevelParents } from "@/lib/hierarchy";
import { createField, updateField, deleteField, reorderFields, resetFields, type FieldInputT } from "./actions";

type F = { id: string; key: string; label: string; type: FieldType; options: string[]; role: FieldRole; required: boolean; showInTable: boolean; width: number; aliases: string[]; formula: string | null; config: { levelParents?: Record<string, string | null> } };

export function FieldsTab({ projectId, moduleKey, fields: f0, itemCount }: { projectId: string; moduleKey: "fa" | "dd"; fields: F[]; itemCount: number }) {
  const router = useRouter();
  const [fields, setFields] = useState(f0);
  const [editing, setEditing] = useState<F | "new" | null>(null);
  const a = useAction();
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    const n = [...fields];
    [n[i], n[j]] = [n[j], n[i]];
    setFields(n);
    a.exec(() => reorderFields(projectId, moduleKey, n.map((x) => x.id)), () => router.refresh());
  };
  const roleLabel = (r: FieldRole) => FIELD_ROLES.find((x) => x.value === r)?.label;
  const name = moduleKey === "fa" ? "FA 项目管理（任务跟踪表）" : "DD 管理（材料信息收集进度表）";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-xs leading-5 text-brand-sage">
          定义 <b className="font-medium text-brand-mist">{name}</b> 的列。字段顺序即表格与导出的列顺序；
          「语义角色」告诉系统哪一列是状态、类别、级别等，用于统计、PDF 报告与导入匹配。默认字段按 Project Aoyama 模板生成，与导入 Skill 的列映射一一对应；「Excel 表头别名」用于兼容其他写法的表头。
        </p>
        <div className="flex gap-2">
          {itemCount === 0 && (
            <ConfirmButton
              className="btn-secondary"
              title="恢复默认字段"
              confirmText="恢复"
              body="将删除当前全部字段并恢复系统默认模板。仅在模块内没有记录时可用。"
              onConfirm={() => a.exec(() => resetFields(projectId, moduleKey), () => router.refresh())}
            >
              <RotateCcw size={14} />恢复默认
            </ConfirmButton>
          )}
          <button className="btn-primary" onClick={() => setEditing("new")}><Plus size={15} />新增字段</button>
        </div>
      </div>
      <Alert>{a.error}</Alert>
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th w-20">顺序</th><th className="th">字段名称</th><th className="th w-36">类型</th><th className="th">下拉选项</th>
              <th className="th w-32">语义角色</th><th className="th w-16 text-center">必填</th><th className="th w-16 text-center">列表</th><th className="th w-24" />
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => (
              <tr key={f.id} className="hover:bg-ink-850/60">
                <td className="td">
                  <div className="flex gap-0.5">
                    <button className="rounded p-1 text-brand-sage hover:bg-ink-700 hover:text-brand-paper disabled:opacity-20" disabled={i === 0 || a.pending} onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
                    <button className="rounded p-1 text-brand-sage hover:bg-ink-700 hover:text-brand-paper disabled:opacity-20" disabled={i === fields.length - 1 || a.pending} onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
                  </div>
                </td>
                <td className="td">
                  <div className="text-brand-paper">{f.label}</div>
                  <div className="font-mono text-[10px] text-brand-sage/70">{f.key}</div>
                </td>
                <td className="td text-xs">{fieldTypeLabel(f.type)}{f.formula && <div className="mt-0.5"><Badge tone="outline" >自动计算</Badge></div>}</td>
                <td className="td">
                  <div className="flex max-w-md flex-wrap gap-1">
                    {hasOptions(f.type) ? f.options.map((o) => <Badge key={o} tone="outline">{o}</Badge>) : <span className="text-brand-sage/40">—</span>}
                  </div>
                  {moduleKey === "fa" && f.role === "priority" && (
                    <div className="mt-1.5 space-y-0.5 text-2xs text-brand-sage">
                      {Object.entries(getLevelParents(f.config, f.options)).map(([lv, p]) => (
                        <div key={lv}>{lv} {p ? <>→ 从属于 <span className="text-brand-mist">{p}</span></> : <span className="text-brand-mist">（顶级）</span>}</div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="td">{f.role ? <Badge tone="mid">{roleLabel(f.role)}</Badge> : <span className="text-brand-sage/40">—</span>}</td>
                <td className="td text-center text-xs">{f.required ? "✓" : ""}</td>
                <td className="td text-center">{f.showInTable ? <Eye size={13} className="mx-auto text-brand-sage" /> : <EyeOff size={13} className="mx-auto text-brand-sage/40" />}</td>
                <td className="td">
                  <div className="flex justify-end gap-1">
                    <button className="btn-ghost btn-sm" onClick={() => setEditing(f)}><Pencil size={13} /></button>
                    <ConfirmButton
                      className="btn-ghost btn-sm text-danger"
                      title="删除字段"
                      confirmText="删除字段"
                      body={<>确定删除字段 <b className="text-brand-paper">{f.label}</b>？该列将不再显示与导出。已有记录中的数据会保留在数据库中，重新创建同名字段即可找回。</>}
                      onConfirm={() => a.exec(() => deleteField(projectId, f.id), () => { setFields((x) => x.filter((y) => y.id !== f.id)); router.refresh(); })}
                    >
                      <Trash2 size={13} />
                    </ConfirmButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <FieldModal
          key={editing === "new" ? "new" : editing.id}
          f={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(input) => (editing === "new" ? createField(projectId, moduleKey, input) : updateField(projectId, editing.id, input))}
          moduleKey={moduleKey}
          onSaved={() => router.refresh()}
          itemCount={itemCount}
        />
      )}
    </>
  );
}

// 服务端 revalidate 后 f0 会变化；用 key 触发重新挂载
export function FieldsTabKeyed(props: Parameters<typeof FieldsTab>[0]) {
  return <FieldsTab key={props.fields.map((f) => f.id + f.label + f.type).join()} {...props} />;
}

function FieldModal({ f, onClose, onSave, onSaved, itemCount, moduleKey }: {
  f: F | null; onClose: () => void; itemCount: number; moduleKey: "fa" | "dd";
  onSave: (i: FieldInputT) => ReturnType<typeof createField>; onSaved: () => void;
}) {
  const a = useAction();
  const [v, setV] = useState({
    label: f?.label ?? "", type: f?.type ?? ("text" as FieldType), optionsText: (f?.options ?? []).join("\n"), role: f?.role ?? null,
    required: f?.required ?? false, showInTable: f?.showInTable ?? true, width: f?.width ?? 160, aliasesText: (f?.aliases ?? []).join("\n"),
  });
  const typeChanged = f && f.type !== v.type && itemCount > 0;
  const lines = (s: string) => s.split(/\n|,|，/).map((x) => x.trim()).filter(Boolean);
  const isLevel = moduleKey === "fa" && v.role === "priority" && hasOptions(v.type);
  const [lp, setLp] = useState<Record<string, string | null>>(getLevelParents(f?.config, f?.options ?? []));
  const opts = lines(v.optionsText);
  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-xl"
      title={f ? `编辑字段 · ${f.label}` : "新增字段"}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button
            className="btn-primary"
            disabled={a.pending}
            onClick={() =>
              a.exec(
                () => onSave({
                  label: v.label, type: v.type, options: lines(v.optionsText), role: v.role, required: v.required, showInTable: v.showInTable, width: Number(v.width), aliases: lines(v.aliasesText),
                  config: isLevel ? { levelParents: Object.fromEntries(opts.map((o) => [o, lp[o] ?? null])) } : (f?.config ?? {}),
                }),
                () => { onClose(); onSaved(); },
              )
            }
          >
            保存
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">字段名称（与 Excel 表头一致）</label><input className="input" value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} /></div>
        <div>
          <label className="label">字段类型</label>
          <select className="input" value={v.type} disabled={!!f?.formula} onChange={(e) => setV({ ...v, type: e.target.value as FieldType })}>
            {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        {f?.formula && <div className="col-span-2"><Alert kind="info">计算字段：{FORMULAS[f.formula]?.desc}。可修改显示名称与列宽，类型与公式固定。</Alert></div>}
        {typeChanged && <div className="col-span-2"><Alert kind="info">已有 {itemCount} 条记录。修改类型不会转换已存数据，不符合新类型的值在编辑时需要重新填写。</Alert></div>}
        {hasOptions(v.type) && (
          <div className="col-span-2">
            <label className="label">下拉选项（每行一个，顺序即排序）</label>
            <textarea className="input min-h-[110px] font-mono text-xs" value={v.optionsText} onChange={(e) => setV({ ...v, optionsText: e.target.value })} placeholder={"未开始\n进行中\n已完成"} />
          </div>
        )}
        {isLevel && opts.length > 0 && (
          <div className="col-span-2 rounded-md border border-line bg-ink-950/40 p-3">
            <div className="mb-1 text-xs font-medium text-brand-mist">等级从属关系</div>
            <p className="mb-2.5 text-2xs leading-4 text-brand-sage">为每个任务等级指定其上级等级。系统据此校验任务编号：如 P0-02.1（二级任务）必须从属于等级为「一级任务」的 P0-02。</p>
            <div className="space-y-1.5">
              {opts.map((o) => (
                <div key={o} className="flex items-center gap-2 text-xs">
                  <span className="w-28 truncate text-brand-paper">{o}</span>
                  <span className="text-brand-sage">从属于</span>
                  <select className="input w-44 py-1 text-xs" value={lp[o] ?? ""} onChange={(e) => setLp({ ...lp, [o]: e.target.value || null })}>
                    <option value="">（顶级，无上级）</option>
                    {opts.filter((x) => x !== o).map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className="label">语义角色</label>
          <select className="input" value={v.role ?? ""} onChange={(e) => setV({ ...v, role: (e.target.value || null) as FieldRole })}>
            <option value="">无</option>
            {FIELD_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <div className="mt-1 text-2xs text-brand-sage">{FIELD_ROLES.find((r) => r.value === v.role)?.hint || "每个角色在同一模块内只能指派给一个字段"}</div>
        </div>
        <div><label className="label">列宽（px）</label><input type="number" min={60} max={600} className="input font-num" value={v.width} onChange={(e) => setV({ ...v, width: Number(e.target.value) })} /></div>
        <div className="col-span-2">
          <label className="label">Excel 表头别名（可选，每行一个）</label>
          <textarea className="input min-h-[56px] text-xs" value={v.aliasesText} onChange={(e) => setV({ ...v, aliasesText: e.target.value })} placeholder="导入时这些表头也会映射到本字段，例如：任务描述、工作内容" />
        </div>
        <div className="col-span-2 flex items-center gap-6 pt-1">
          <label className="flex items-center gap-2 text-sm text-brand-mist"><Toggle checked={v.required} onChange={(x) => setV({ ...v, required: x })} />必填</label>
          <label className="flex items-center gap-2 text-sm text-brand-mist"><Toggle checked={v.showInTable} onChange={(x) => setV({ ...v, showInTable: x })} />在列表中显示</label>
        </div>
      </div>
      <div className="mt-3"><Alert>{a.error}</Alert></div>
    </Modal>
  );
}
