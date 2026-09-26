"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileSpreadsheet, Sparkles, CheckCircle2 } from "lucide-react";
import { Alert, Badge, Modal, Toggle, cn, useAction } from "@/components/ui";
import { previewImport, applyImport } from "@/app/p/[projectId]/[module]/import-actions";
import type { ImportPreview } from "@/lib/import/types";

const SKILL = { fa: { name: "solyn-skill-fa-pm-import", file: "《项目管理进度表》" }, dd: { name: "solyn-skill-fa-dd-import", file: "《DD材料信息收集进度表》" } };
const HOW: Record<string, string> = { exact: "精确", alias: "别名", fuzzy: "近似", claude: "Claude", computed: "计算列", none: "未匹配" };

export function ImportDialog({ projectId, moduleKey, onClose }: { projectId: string; moduleKey: "fa" | "dd"; onClose: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"merge" | "sync">("merge");
  const [keepEmpty, setKeepEmpty] = useState(true);
  const [useClaude, setUseClaude] = useState(true);
  const [createFields, setCreateFields] = useState(false);
  const [addOptions, setAddOptions] = useState(true);
  const [applyStart, setApplyStart] = useState(true);
  const [pv, setPv] = useState<ImportPreview | null>(null);
  const [tab, setTab] = useState<"create" | "update" | "delete" | "columns" | "warn">("update");
  const [done, setDone] = useState<{ create: number; update: number; delete: number } | null>(null);
  const a = useAction();
  const s = SKILL[moduleKey];

  function preview() {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("mode", mode);
    fd.set("keepEmpty", keepEmpty ? "1" : "0");
    fd.set("useClaude", useClaude ? "1" : "0");
    fd.set("createFields", createFields ? "1" : "0");
    a.exec(() => previewImport(projectId, moduleKey, fd), (r) => {
      const d = r.data as ImportPreview;
      setPv(d);
      setTab(d.counts.create && !d.counts.update ? "create" : d.counts.update ? "update" : d.counts.delete ? "delete" : "columns");
    });
  }
  function apply() {
    if (!pv) return;
    a.exec(() => applyImport(projectId, moduleKey, pv.batchId, { addOptions, applyStartDate: applyStart }), (r) => {
      setDone(r.data as { create: number; update: number; delete: number });
      router.refresh();
    });
  }

  const nothing = pv && !pv.counts.create && !pv.counts.update && !pv.counts.delete;

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-4xl"
      title={<span className="flex items-center gap-2"><Upload size={15} />导入 Excel <span className="font-mono text-2xs font-normal text-brand-sage">{s.name}</span></span>}
      footer={
        done ? (
          <button className="btn-primary" onClick={onClose}>完成</button>
        ) : pv ? (
          <>
            <button className="btn-secondary mr-auto" onClick={() => { setPv(null); a.setError(null); }}>重新选择</button>
            <button className="btn-secondary" onClick={onClose}>取消</button>
            <button className="btn-primary" disabled={a.pending || !!nothing} onClick={apply}>
              {a.pending ? "写入中…" : `确认导入（新增 ${pv.counts.create} · 更新 ${pv.counts.update}${pv.counts.delete ? ` · 删除 ${pv.counts.delete}` : ""}）`}
            </button>
          </>
        ) : (
          <>
            <button className="btn-secondary" onClick={onClose}>取消</button>
            <button className="btn-primary" disabled={!file || a.pending} onClick={preview}>{a.pending ? "解析中…" : "解析并预览"}</button>
          </>
        )
      }
    >
      {done ? (
        <div className="flex flex-col items-center py-8 text-center">
          <CheckCircle2 size={36} strokeWidth={1.3} className="text-brand-sage" />
          <div className="mt-3 text-base text-brand-paper">导入完成</div>
          <div className="mt-1.5 text-sm text-brand-sage">新增 {done.create} 条 · 更新 {done.update} 条 · 删除 {done.delete} 条。每条变更的日期已写入变更记录。</div>
        </div>
      ) : !pv ? (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-brand-mist">
            上传{s.file}（.xlsx）。系统按「编号」与现有记录比对，先生成差异预览，确认后才写入。计算列（计划日期、延迟天数、前缀编码）由系统自动计算，文件中的值会被忽略。
          </p>
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
            className="flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-ink-950/50 px-6 py-8 transition hover:border-brand-sage"
          >
            <FileSpreadsheet size={26} strokeWidth={1.3} className="text-brand-sage" />
            <div className="mt-2 text-sm text-brand-paper">{file ? file.name : "点击选择或拖入 Excel 文件"}</div>
            <div className="mt-1 text-2xs text-brand-sage">{file ? `${(file.size / 1024).toFixed(0)} KB` : "仅支持 .xlsx，最大 4MB"}</div>
          </button>
          <input ref={input} type="file" accept=".xlsx" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-line p-3">
              <div className="mb-2 text-xs font-medium text-brand-mist">导入方式</div>
              {([["merge", "合并", "新增文件中新出现的编号，更新已有编号；网站中存在而文件里没有的记录保留"], ["sync", "完全同步", "以文件为准：网站中存在但文件里没有的记录将被删除（可在变更记录中恢复）"]] as const).map(([k, l, d]) => (
                <label key={k} className={cn("mb-1.5 flex cursor-pointer gap-2 rounded px-2 py-1.5", mode === k && "bg-ink-700")}>
                  <input type="radio" className="mt-1 accent-[#3F6E58]" checked={mode === k} onChange={() => setMode(k)} />
                  <span><span className="text-sm text-brand-paper">{l}</span><span className="block text-2xs leading-4 text-brand-sage">{d}</span></span>
                </label>
              ))}
            </div>
            <div className="space-y-2.5 rounded-md border border-line p-3 text-xs text-brand-mist">
              <label className="flex items-center justify-between gap-3">空单元格不覆盖网站中已有的值<Toggle checked={keepEmpty} onChange={setKeepEmpty} /></label>
              <label className="flex items-center justify-between gap-3"><span className="flex items-center gap-1"><Sparkles size={12} className="text-brand-sage" />表头无法识别时调用 Claude 映射</span><Toggle checked={useClaude} onChange={setUseClaude} /></label>
              <label className="flex items-center justify-between gap-3">未匹配的列自动新增为文本字段<Toggle checked={createFields} onChange={setCreateFields} /></label>
            </div>
          </div>
          <Alert>{a.error}</Alert>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-brand-sage">
            <span className="text-brand-paper">{pv.fileName}</span>
            <span>工作表「{pv.sheetName}」· 表头第 {pv.headerRow} 行 · 数据 {pv.counts.rows} 行 · 未变化 {pv.counts.unchanged} 行</span>
            {pv.usedClaude && <Badge tone="mid"><Sparkles size={10} />已调用 Claude 识别表头</Badge>}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {([["create", "新增", pv.counts.create], ["update", "更新", pv.counts.update], ["delete", "删除", pv.counts.delete], ["columns", "已匹配列", pv.columns.filter((c) => c.fieldKey).length], ["warn", "提示", pv.counts.warnings]] as const).map(([k, l, n]) => (
              <button key={k} onClick={() => setTab(k)} className={cn("card p-3 text-left transition hover:border-line-strong", tab === k && "border-brand-sage")}>
                <div className="text-2xs text-brand-sage">{l}</div>
                <div className={cn("mt-1 font-num text-2xl leading-none", k === "delete" && n ? "text-danger" : "text-brand-paper")}>{n}</div>
              </button>
            ))}
          </div>

          {moduleKey === "fa" && pv.meta.startDate && (
            <label className="flex items-center justify-between gap-3 rounded-md border border-line bg-ink-950/40 px-3 py-2 text-xs text-brand-mist">
              <span>文件中的项目开始日 <b className="font-num text-brand-paper">{pv.meta.startDate}</b>（网站当前：{pv.currentStartDate ?? "未设置"}）— 同步到项目，计划日期将按此推算</span>
              <Toggle checked={applyStart} onChange={setApplyStart} />
            </label>
          )}
          {pv.newOptions.length > 0 && (
            <label className="flex items-start justify-between gap-3 rounded-md border border-line bg-ink-950/40 px-3 py-2 text-xs text-brand-mist">
              <span>
                文件中出现了字段选项之外的值：
                {pv.newOptions.map((o) => <span key={o.field} className="ml-1"><b className="text-brand-paper">{o.field}</b>（{o.values.map((v) => v.replace(/\n/g, " / ")).join("、")}）</span>)}
                <span className="block text-2xs text-brand-sage">开启后自动加入下拉选项；关闭则照常写入，但会显示为「非选项值」</span>
              </span>
              <Toggle checked={addOptions} onChange={setAddOptions} />
            </label>
          )}

          <div className="max-h-[42vh] overflow-y-auto rounded-md border border-line">
            {tab === "create" && <List rows={pv.creates.map((c) => [c.code, c.title])} empty="没有新增记录" />}
            {tab === "delete" && <List rows={pv.deletes.map((c) => [c.code, c.title])} empty="没有将被删除的记录" danger />}
            {tab === "update" &&
              (pv.updates.length ? (
                <table className="w-full">
                  <tbody>
                    {pv.updates.map((u) => (
                      <tr key={u.code}>
                        <td className="td w-24 font-num text-xs text-brand-paper">{u.code}</td>
                        <td className="td">
                          <div className="mb-1 text-xs text-brand-mist">{u.title}</div>
                          {u.changes.map((c, i) => (
                            <div key={i} className="text-2xs">
                              <span className="text-brand-sage">{c.field}：</span>
                              <span className="text-brand-sage/70 line-through">{c.from.replace(/\n/g, " ") || "（空）"}</span>
                              <span className="mx-1 text-brand-sage">→</span>
                              <span className="text-brand-mist">{c.to.replace(/\n/g, " ") || "（空）"}</span>
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="p-6 text-center text-xs text-brand-sage">没有需要更新的记录</div>)}
            {tab === "columns" && (
              <table className="w-full">
                <thead><tr><th className="th">Excel 列</th><th className="th">映射到字段</th><th className="th w-24">方式</th></tr></thead>
                <tbody>
                  {pv.columns.map((c) => (
                    <tr key={c.col}>
                      <td className="td text-xs">{c.header}</td>
                      <td className="td text-xs">{c.fieldLabel ?? <span className="text-brand-sage/60">{pv.newFields.includes(c.header) ? "→ 新增字段" : "忽略"}</span>}</td>
                      <td className="td"><Badge tone={c.how === "none" ? "warn" : c.how === "computed" ? "outline" : c.how === "claude" ? "mid" : "neutral"}>{HOW[c.how]}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === "warn" && <List rows={pv.warnings.map((w, i) => [String(i + 1), w])} empty="没有提示" />}
          </div>
          {nothing && <Alert kind="info">文件与网站数据一致，没有需要写入的变更。</Alert>}
          <Alert>{a.error}</Alert>
        </div>
      )}
    </Modal>
  );
}

function List({ rows, empty, danger }: { rows: string[][]; empty: string; danger?: boolean }) {
  if (!rows.length) return <div className="p-6 text-center text-xs text-brand-sage">{empty}</div>;
  return (
    <table className="w-full">
      <tbody>
        {rows.map(([a, b], i) => (
          <tr key={i}>
            <td className={cn("td w-24 font-num text-xs", danger ? "text-danger" : "text-brand-paper")}>{a}</td>
            <td className="td text-xs">{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
