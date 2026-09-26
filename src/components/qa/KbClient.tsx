"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, FolderPlus, Upload, FileText, MessageSquareText, Pencil, Trash2, Library, X, ExternalLink, Sparkles,
} from "lucide-react";
import { Alert, Badge, ConfirmButton, Drawer, EmptyState, Modal, cn, useAction } from "@/components/ui";
import { QA_GROUPS, QA_GROUP_META, audienceText } from "@/lib/qa/groups";
import { highlightParts } from "@/lib/qa/kb-core";
import { fmtDateTime } from "@/lib/format";
import type { ActionResult } from "@/lib/action";
import { createArea, updateArea, deleteArea, uploadDocs, moveDoc, deleteDoc } from "@/app/p/[projectId]/qa/kb/actions";

export type KbArea = { id: string; name: string; accessGroup: string; description: string | null; docs: number };
export type KbDoc = { id: string; areaId: string; seq: number; name: string; title: string | null; size: number; version: number; uploader: string; updatedAt: string };
export type KbHitView = { kind: "qa" | "doc"; ref: string; id: string; anchor: number | null; title: string; sub: string; group: string; area: string | null; lines: [number, number] | null; snippet: string; score: number };
export type KbRecord = { id: string; data: Record<string, unknown>; updatedAt: string };
type KField = { key: string; label: string; type: string; role: string | null };

export function GroupBadge({ g }: { g: string }) {
  return (
    <Badge tone={g === "ADM" ? "green" : g === "SEL" ? "mid" : "outline"} className="font-num tracking-wide">
      <span title={`可见：${audienceText(g)}`}>{g}</span>
    </Badge>
  );
}

export function Hl({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {highlightParts(text, terms).map((p, i) => (p.hit ? <mark key={i} className="rounded-sm bg-[#E3C98A]/30 px-0.5 text-brand-paper">{p.s}</mark> : <span key={i}>{p.s}</span>))}
    </>
  );
}

const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function KbClient(p: {
  projectId: string; canManage: boolean; q: string; scope: string; areaFilter: string; terms: string[];
  areas: KbArea[]; docs: KbDoc[]; hits: KbHitView[]; records: KbRecord[]; fields: KField[]; faTitles: Record<string, string>;
}) {
  const router = useRouter();
  const [q, setQ] = useState(p.q);
  const [scope, setScope] = useState(p.scope);
  const [area, setArea] = useState<string>(p.areaFilter || "__all");
  const [areaDlg, setAreaDlg] = useState<KbArea | "new" | null>(null);
  const [upload, setUpload] = useState(false);
  const [record, setRecord] = useState<KbRecord | null>(null);
  const act = useAction();
  const base = `/p/${p.projectId}/qa/kb`;

  const go = (next: { q?: string; scope?: string; area?: string }) => {
    const sp = new URLSearchParams();
    const qq = next.q ?? q;
    if (qq.trim()) sp.set("q", qq.trim());
    const sc = next.scope ?? scope;
    if (sc !== "all") sp.set("scope", sc);
    const ar = next.area ?? (area === "__all" || area === "__qa" ? "" : area);
    if (ar) sp.set("area", ar);
    router.push(`${base}${sp.size ? `?${sp}` : ""}`);
  };

  const byId = useMemo(() => new Map(p.records.map((r) => [r.id, r])), [p.records]);
  const areaById = useMemo(() => new Map(p.areas.map((a) => [a.id, a])), [p.areas]);
  const shownDocs = area === "__all" ? p.docs : p.docs.filter((d) => d.areaId === area);
  const curArea = areaById.get(area);
  const qaCount = p.hits.filter((h) => h.kind === "qa").length;
  const docCount = p.hits.length - qaCount;

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* 左：文件区 */}
      <aside className="card h-fit p-2">
        <div className="flex items-center justify-between px-2 pb-2 pt-1">
          <span className="eyebrow">知识来源</span>
          {p.canManage && (
            <button className="btn-ghost btn-sm" onClick={() => setAreaDlg("new")} title="新建文件区"><FolderPlus size={13} />文件区</button>
          )}
        </div>
        <SideItem active={area === "__qa"} onClick={() => { setArea("__qa"); if (p.q) go({ scope: "qa", area: "" }); }} icon={<MessageSquareText size={14} />} label="Q&A 记录" count={p.records.length} />
        <div className="my-2 border-t border-line" />
        <SideItem active={area === "__all"} onClick={() => { setArea("__all"); if (p.q) go({ area: "" }); }} icon={<Library size={14} />} label="全部文件区" count={p.docs.length} />
        {p.areas.map((a) => (
          <div key={a.id} className="group relative">
            <SideItem active={area === a.id} onClick={() => { setArea(a.id); if (p.q) go({ area: a.id, scope: scope === "qa" ? "all" : scope }); }} icon={<FileText size={14} />} label={a.name} count={a.docs} badge={a.accessGroup} />
            {p.canManage && (
              <button className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded p-1 text-brand-sage hover:bg-ink-700 hover:text-brand-paper group-hover:block" onClick={() => setAreaDlg(a)} title="编辑文件区">
                <Pencil size={12} />
              </button>
            )}
          </div>
        ))}
        {p.areas.length === 0 && <div className="px-2.5 py-3 text-2xs leading-relaxed text-brand-sage">{p.canManage ? "还没有文件区。新建文件区并设定权限组后即可上传 .md 访谈 / 会议记录。" : "暂无可见的文件区。"}</div>}
        <div className="mt-2 border-t border-line px-2.5 pt-2.5 text-[10px] leading-relaxed text-brand-sage">
          权限组逐级放大：ADM &gt; SEL &gt; EXC &gt; DD。标为 DD 的内容全部权限组可见；标为 EXC 的内容 DD 不可见。
        </div>
      </aside>

      <div className="min-w-0">
        {/* 搜索 */}
        <form
          className="card mb-4 flex flex-wrap items-center gap-2 p-3"
          onSubmit={(e) => { e.preventDefault(); go({}); }}
        >
          <div className="relative min-w-[240px] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-sage" />
            <input className="input pl-9" placeholder="输入关键字，如：Uber 控制权变更、行政处分、在留资格…（空格分隔多个关键字）" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input w-auto py-2 text-xs" value={scope} onChange={(e) => { setScope(e.target.value); if (p.q) go({ scope: e.target.value }); }}>
            <option value="all">全部来源</option>
            <option value="qa">仅 Q&A 记录</option>
            <option value="doc">仅文件区 .md</option>
          </select>
          <button className="btn-primary" type="submit"><Search size={14} />搜索</button>
          {p.q && <button type="button" className="btn-ghost btn-sm" onClick={() => { setQ(""); router.push(base); }}><X size={13} />清除</button>}
          <Link href={`/p/${p.projectId}/qa/ai${p.q ? `?ask=${encodeURIComponent(p.q)}` : ""}`} className="btn-secondary btn-sm ml-auto"><Sparkles size={13} />用 AI 提问</Link>
        </form>

        {p.q ? (
          <div className="card">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-xs text-brand-sage">
              <span>「<span className="text-brand-paper">{p.q}</span>」共找到 {p.hits.length} 条：Q&A 记录 {qaCount} · 文件段落 {docCount}{p.areaFilter && areaById.get(p.areaFilter) ? `（文件区：${areaById.get(p.areaFilter)!.name}）` : ""}</span>
              <span>按相关度排序 · 关键字精确命中优先，其次模糊匹配</span>
            </div>
            {p.hits.length === 0 ? (
              <EmptyState icon={<Search size={26} strokeWidth={1.3} />} title="没有找到相关内容" desc="换一个关键字试试，或减少关键字数量。只会搜索你的权限组可见的 Q&A 记录与文件区。" />
            ) : (
              <ul className="divide-y divide-line">
                {p.hits.map((h) => (
                  <li key={h.ref}>
                    {h.kind === "qa" ? (
                      <button className="block w-full px-4 py-3 text-left hover:bg-ink-850" onClick={() => { const r = byId.get(h.id); if (r) setRecord(r); }}>
                        <HitHead icon={<MessageSquareText size={14} />} kind="Q&A 记录" refLabel={`#${h.ref.slice(1)}`} group={h.group} sub={h.sub} />
                        <div className="mt-1 text-[13px] text-brand-paper"><Hl text={h.title} terms={p.terms} /></div>
                        <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-brand-mist/75"><Hl text={h.snippet} terms={p.terms} /></div>
                      </button>
                    ) : (
                      <Link className="block px-4 py-3 hover:bg-ink-850" href={`${base}/doc/${h.id}?c=${h.anchor}&q=${encodeURIComponent(p.q)}`}>
                        <HitHead icon={<FileText size={14} />} kind={h.area ?? "文件"} refLabel={h.title} group={h.group} sub={`${h.sub}${h.lines ? ` · 第 ${h.lines[0]}–${h.lines[1]} 行` : ""}`} />
                        <div className="mt-1 line-clamp-3 text-xs leading-relaxed text-brand-mist/80"><Hl text={h.snippet} terms={p.terms} /></div>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : area === "__qa" ? (
          <RecordList records={p.records} onOpen={setRecord} projectId={p.projectId} />
        ) : (
          <div className="card">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm text-brand-paper">
                  {curArea ? curArea.name : "全部文件区"}
                  {curArea && <GroupBadge g={curArea.accessGroup} />}
                </div>
                <div className="mt-0.5 text-2xs text-brand-sage">
                  {curArea ? `${curArea.description ? curArea.description + " · " : ""}可见：${audienceText(curArea.accessGroup)}` : `共 ${p.docs.length} 个文件`}
                </div>
              </div>
              {p.canManage && p.areas.length > 0 && <button className="btn-primary btn-sm" onClick={() => setUpload(true)}><Upload size={13} />上传 .md</button>}
            </div>
            <Alert>{act.error}</Alert>
            {shownDocs.length === 0 ? (
              <EmptyState icon={<FileText size={26} strokeWidth={1.3} />} title="暂无文件" desc={p.canManage ? (p.areas.length ? "上传 .md 格式的访谈记录、会议记录或调查报告，上传后即可被搜索与 AI 引用。" : "先在左侧新建一个文件区并设定权限组。") : "项目管理员上传后将显示在这里。"} />
            ) : (
              <table className="w-full border-separate border-spacing-0">
                <thead><tr><th className="th w-14">序号</th><th className="th">文件</th>{area === "__all" && <th className="th w-40">文件区</th>}<th className="th w-20">大小</th><th className="th w-36">更新</th>{p.canManage && <th className="th w-28" />}</tr></thead>
                <tbody>
                  {shownDocs.map((d) => (
                    <tr key={d.id} className="hover:bg-ink-850/70">
                      <td className="td font-num text-xs text-brand-sage">D{d.seq}</td>
                      <td className="td">
                        <Link href={`${base}/doc/${d.id}`} className="block hover:text-brand-paper">
                          <div className="text-[13px] text-brand-paper">{d.title || d.name}</div>
                          <div className="text-2xs text-brand-sage">{d.name}{d.version > 1 ? ` · v${d.version}` : ""}</div>
                        </Link>
                      </td>
                      {area === "__all" && <td className="td text-xs"><span className="mr-1.5">{areaById.get(d.areaId)?.name}</span>{areaById.get(d.areaId) && <GroupBadge g={areaById.get(d.areaId)!.accessGroup} />}</td>}
                      <td className="td font-num text-xs text-brand-sage">{kb(d.size)}</td>
                      <td className="td text-2xs text-brand-sage"><div className="font-num">{fmtDateTime(d.updatedAt)}</div><div>{d.uploader}</div></td>
                      {p.canManage && (
                        <td className="td">
                          <div className="flex justify-end gap-1">
                            {p.areas.length > 1 && (
                              <select
                                className="input w-24 py-1 text-2xs"
                                title="移动到其他文件区"
                                value=""
                                onChange={(e) => e.target.value && act.exec(() => moveDoc(p.projectId, d.id, e.target.value), () => router.refresh())}
                              >
                                <option value="">移动到…</option>
                                {p.areas.filter((a) => a.id !== d.areaId).map((a) => <option key={a.id} value={a.id}>{a.name}（{a.accessGroup}）</option>)}
                              </select>
                            )}
                            <ConfirmButton className="btn-ghost btn-sm text-danger" title="删除文件" confirmText="删除" body={`确定删除「${d.name}」？删除后不可恢复，AI 历史回答中对它的引用将无法打开。`} onConfirm={() => act.exec(() => deleteDoc(p.projectId, d.id), () => router.refresh())}>
                              <Trash2 size={13} />
                            </ConfirmButton>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {areaDlg && <AreaDialog projectId={p.projectId} area={areaDlg === "new" ? null : areaDlg} onClose={() => setAreaDlg(null)} />}
      {upload && <UploadDialog projectId={p.projectId} areas={p.areas} defaultArea={curArea?.id ?? p.areas[0]?.id ?? ""} onClose={() => setUpload(false)} />}
      <RecordDrawer record={record} onClose={() => setRecord(null)} fields={p.fields} terms={p.terms} faTitles={p.faTitles} docs={p.docs} projectId={p.projectId} />
    </div>
  );
}

function SideItem({ active, onClick, icon, label, count, badge }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number; badge?: string }) {
  return (
    <button onClick={onClick} className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition", active ? "bg-ink-700 text-brand-paper" : "text-brand-mist/80 hover:bg-ink-850")}>
      <span className="text-brand-sage">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge && <span className="font-num text-[10px] tracking-wide text-brand-sage">{badge}</span>}
      <span className="font-num text-2xs text-brand-sage/80">{count}</span>
    </button>
  );
}

function HitHead({ icon, kind, refLabel, group, sub }: { icon: React.ReactNode; kind: string; refLabel: string; group: string; sub: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-2xs text-brand-sage">
      <span className="text-brand-sage">{icon}</span>
      <span>{kind}</span>
      <span className="font-num text-brand-mist">{refLabel}</span>
      <GroupBadge g={group} />
      <span className="truncate">{sub}</span>
    </div>
  );
}

function RecordList({ records, onOpen, projectId }: { records: KbRecord[]; onOpen: (r: KbRecord) => void; projectId: string }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-xs text-brand-sage">
        <span>你可见的 Q&A 记录 {records.length} 条</span>
        <Link href={`/p/${projectId}/qa`} className="inline-flex items-center gap-1 hover:text-brand-paper"><ExternalLink size={12} />在问答跟踪中管理</Link>
      </div>
      {records.length === 0 ? (
        <EmptyState icon={<MessageSquareText size={26} strokeWidth={1.3} />} title="暂无可见的 Q&A 记录" />
      ) : (
        <ul className="divide-y divide-line">
          {records.map((r) => (
            <li key={r.id}>
              <button className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-ink-850" onClick={() => onOpen(r)}>
                <span className="w-8 shrink-0 font-num text-xs text-brand-sage">#{String(r.data.code ?? "")}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-brand-paper">{String(r.data.question ?? "").split("\n")[0]}</span>
                  <span className="block text-2xs text-brand-sage">{[r.data.stage, r.data.respondent, r.data.status].filter(Boolean).join(" · ")}</span>
                </span>
                <GroupBadge g={String(r.data.access_group ?? "") || "ADM"} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RecordDrawer({ record, onClose, fields, terms, faTitles, docs, projectId }: {
  record: KbRecord | null; onClose: () => void; fields: KField[]; terms: string[]; faTitles: Record<string, string>; docs: KbDoc[]; projectId: string;
}) {
  const d = record?.data ?? {};
  const docByName = new Map(docs.map((x) => [x.name.replace(/\.(md|markdown)$/i, ""), x]));
  return (
    <Drawer
      open={!!record}
      onClose={onClose}
      width={620}
      title={record ? `Q&A #${String(d.code ?? "")}` : ""}
      subtitle={record ? `最后更新 ${fmtDateTime(record.updatedAt)}` : ""}
      footer={<Link href={`/p/${projectId}/qa`} className="btn-secondary btn-sm"><ExternalLink size={13} />在问答跟踪中查看</Link>}
    >
      {record && (
        <dl className="divide-y divide-line">
          {fields.filter((f) => f.key !== "code").map((f) => {
            const v = d[f.key];
            const txt = v === null || v === undefined || v === "" ? "" : Array.isArray(v) ? v.join("、") : String(v);
            let extra: React.ReactNode = null;
            if (f.key === "stage" && faTitles[txt]) extra = <span className="ml-2 text-brand-sage">FA 任务：{faTitles[txt]}</span>;
            if (f.key === "interview_ref" && txt) {
              const doc = docByName.get(txt.replace(/\.(md|markdown)$/i, ""));
              if (doc) extra = <Link href={`/p/${projectId}/qa/kb/doc/${doc.id}`} className="ml-2 text-brand-sage underline hover:text-brand-paper">打开文件</Link>;
            }
            return (
              <div key={f.key} className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 px-5 py-2.5">
                <dt className="text-xs text-brand-sage">{f.label}</dt>
                <dd className="whitespace-pre-wrap text-[13px] leading-relaxed text-brand-mist">
                  {f.role === "access" ? <GroupBadge g={txt || "ADM"} /> : txt ? <Hl text={txt} terms={terms} /> : <span className="text-brand-sage/40">—</span>}
                  {extra}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </Drawer>
  );
}

function AreaDialog({ projectId, area, onClose }: { projectId: string; area: KbArea | null; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(area?.name ?? "");
  const [group, setGroup] = useState(area?.accessGroup ?? "ADM");
  const [desc, setDesc] = useState(area?.description ?? "");
  const a = useAction();
  const del = useAction();
  const save = () => a.exec<unknown>(() => (area ? updateArea(projectId, area.id, { name, accessGroup: group, description: desc }) : createArea(projectId, { name, accessGroup: group, description: desc })) as Promise<ActionResult<unknown>>, () => { router.refresh(); onClose(); });
  return (
    <Modal
      open
      onClose={onClose}
      title={area ? "编辑 Q&A 文件区" : "新建 Q&A 文件区"}
      footer={
        <>
          {area && (
            <ConfirmButton className="btn-ghost mr-auto text-danger" title="删除文件区" confirmText="删除" body={`确定删除文件区「${area.name}」及其中 ${area.docs} 个文件？删除后不可恢复。`} onConfirm={() => del.exec(() => deleteArea(projectId, area.id), () => { router.refresh(); onClose(); })}>
              <Trash2 size={13} />删除
            </ConfirmButton>
          )}
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" disabled={a.pending} onClick={save}>保存</button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="label">名称</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="如：社长面谈记录、公开信息调查、管理层会议纪要" autoFocus />
        </label>
        <div>
          <span className="label">权限组</span>
          <div className="grid grid-cols-4 gap-2">
            {QA_GROUPS.map((g) => (
              <button key={g} type="button" onClick={() => setGroup(g)} className={cn("rounded-md border px-2 py-2 text-left transition", group === g ? "border-brand-sage bg-ink-700" : "border-line hover:border-line-strong")}>
                <div className="font-num text-sm text-brand-paper">{g}</div>
                <div className="text-[10px] leading-tight text-brand-sage">{QA_GROUP_META[g].desc}</div>
              </button>
            ))}
          </div>
          <div className="mt-2 text-2xs text-brand-sage">可见：{audienceText(group)}</div>
        </div>
        <label className="block">
          <span className="label">说明（可选）</span>
          <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </label>
        <Alert>{a.error || del.error}</Alert>
      </div>
    </Modal>
  );
}

function UploadDialog({ projectId, areas, defaultArea, onClose }: { projectId: string; areas: KbArea[]; defaultArea: string; onClose: () => void }) {
  const router = useRouter();
  const [areaId, setAreaId] = useState(defaultArea);
  const [files, setFiles] = useState<File[]>([]);
  const ref = useRef<HTMLInputElement>(null);
  const a = useAction();
  const submit = () => {
    const fd = new FormData();
    fd.set("areaId", areaId);
    files.forEach((f) => fd.append("files", f));
    a.exec(() => uploadDocs(projectId, fd), () => { router.refresh(); onClose(); });
  };
  const area = areas.find((x) => x.id === areaId);
  return (
    <Modal open onClose={onClose} title="上传 .md 文件" footer={<><button className="btn-secondary" onClick={onClose}>取消</button><button className="btn-primary" disabled={!files.length || !areaId || a.pending} onClick={submit}><Upload size={14} />{a.pending ? "上传中…" : `上传 ${files.length || ""} 个文件`}</button></>}>
      <div className="space-y-4">
        <label className="block">
          <span className="label">文件区</span>
          <select className="input" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            {areas.map((x) => <option key={x.id} value={x.id}>{x.name}（{x.accessGroup}）</option>)}
          </select>
          {area && <span className="mt-1 block text-2xs text-brand-sage">上传后可见：{audienceText(area.accessGroup)}</span>}
        </label>
        <div>
          <input ref={ref} type="file" accept=".md,.markdown,text/markdown" multiple className="hidden" onChange={(e) => setFiles([...(e.target.files ?? [])])} />
          <button type="button" className="flex w-full flex-col items-center rounded-md border border-dashed border-line-strong px-4 py-6 text-center hover:border-brand-sage" onClick={() => ref.current?.click()}>
            <Upload size={20} className="mb-2 text-brand-sage" />
            <span className="text-sm text-brand-paper">{files.length ? files.map((f) => f.name).join("、") : "选择 .md 文件（可多选）"}</span>
            <span className="mt-1 text-2xs text-brand-sage">单个文件 ≤ 2MB；同一文件区内同名文件会作为新版本覆盖</span>
          </button>
        </div>
        <Alert>{a.error}</Alert>
      </div>
    </Modal>
  );
}
