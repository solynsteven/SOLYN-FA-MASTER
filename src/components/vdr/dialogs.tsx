"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Lock, FileText, Trash2 } from "lucide-react";
import { upload as blobUpload } from "@vercel/blob/client";
import { Alert, Modal, Toggle, useAction, cn } from "@/components/ui";
import { VDR_GROUPS, LEVELS, levelMeta, fmtSize, VDR_ACTION_LABEL } from "@/lib/vdr/constants";
import { makeResolver } from "@/lib/vdr/resolve";
import { fmtDateTime } from "@/lib/format";
import type { VdrLevel, VdrGroup } from "@/db/schema";
import type { ActionResult } from "@/lib/action";
import {
  createPhase, updatePhase, createFolder, renameFolder, registerFile, updateFile, setPermissions, unlockPhase, folderLog, type PermEntry,
} from "@/app/p/[projectId]/vdr/actions";
import type { VFolder, VFile, VPerm, VMember, CodeOpt } from "./types";

export function LevelTag({ level, className }: { level: VdrLevel; className?: string }) {
  const m = levelMeta(level);
  return (
    <span title={m.label} className={cn("inline-flex h-4 min-w-4 items-center justify-center rounded px-1 font-num text-[10px] font-semibold", className)} style={{ color: m.color, border: `1px solid ${m.color}66` }}>
      {m.short}
    </span>
  );
}

/* ------------------------------ Phase ------------------------------ */

export function PhaseDialog({ projectId, phase, faCodes, onClose }: { projectId: string; phase?: VFolder; faCodes: CodeOpt[]; onClose: () => void }) {
  const router = useRouter();
  const a = useAction();
  const [f, setF] = useState({
    name: phase?.name ?? "", openMode: phase?.openMode ?? ("closed" as VFolder["openMode"]), openTaskCode: phase?.openTaskCode ?? "",
    openTrigger: phase?.openTrigger ?? ("started" as VFolder["openTrigger"]), password: "", changePassword: !phase,
  });
  const phases = faCodes.filter((c) => /-0+$/.test(c.code));
  return (
    <Modal
      open onClose={onClose} width="max-w-lg" title={phase ? `Phase 区设置 · ${phase.name}` : "新建 Phase 区"}
      footer={<><button className="btn-secondary" onClick={onClose}>取消</button><button className="btn-primary" disabled={a.pending} onClick={() => a.exec(
        async (): Promise<ActionResult<unknown>> => (phase ? updatePhase(projectId, phase.id, { ...f, password: f.password || null }) : createPhase(projectId, { ...f, password: f.password || null })),
        () => { onClose(); router.refresh(); },
      )}>保存</button></>}
    >
      <div className="space-y-4">
        <div><label className="label">Phase 区名称</label><input className="input" placeholder="如 Phase 1 · IM 与一次入札资料" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div>
          <label className="label">访问密码</label>
          {phase && (
            <label className="mb-2 flex items-center gap-2 text-xs text-brand-mist">
              <Toggle checked={f.changePassword} onChange={(v) => setF({ ...f, changePassword: v })} />
              修改密码{phase.hasPassword ? "（当前已设置）" : "（当前未设置）"}
            </label>
          )}
          {f.changePassword && (
            <>
              <input className="input font-mono" type="text" autoComplete="off" placeholder="留空表示不设密码" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
              <p className="mt-1 text-2xs text-brand-sage">普通用户首次进入该 Phase 区需输入密码（12 小时内有效）。修改密码后，已进入的用户需重新输入。管理员不受限制。</p>
            </>
          )}
        </div>
        <div>
          <label className="label">开放方式</label>
          <div className="space-y-1.5">
            {([["closed", "关闭", "普通用户不可见"], ["open", "开放", "立即对有权限的用户开放"], ["by_task", "按项目进度自动开放", "当指定的 FA 任务开始或完成时自动开放"]] as const).map(([k, l, d]) => (
              <label key={k} className={cn("flex cursor-pointer gap-2 rounded px-2 py-1.5", f.openMode === k && "bg-ink-700")}>
                <input type="radio" className="mt-1 accent-[#3F6E58]" checked={f.openMode === k} onChange={() => setF({ ...f, openMode: k })} />
                <span><span className="text-sm text-brand-paper">{l}</span><span className="block text-2xs text-brand-sage">{d}</span></span>
              </label>
            ))}
          </div>
          {f.openMode === "by_task" && (
            <div className="mt-2 grid grid-cols-[1fr_140px] gap-2">
              <select className="input text-xs" value={f.openTaskCode} onChange={(e) => setF({ ...f, openTaskCode: e.target.value })}>
                <option value="">选择 FA 任务…</option>
                {(phases.length ? phases : faCodes).map((c) => <option key={c.code} value={c.code}>{c.code}　{c.title}</option>)}
                {phases.length > 0 && <optgroup label="其他任务">{faCodes.filter((c) => !phases.includes(c)).map((c) => <option key={c.code} value={c.code}>{c.code}　{c.title}</option>)}</optgroup>}
              </select>
              <select className="input text-xs" value={f.openTrigger} onChange={(e) => setF({ ...f, openTrigger: e.target.value as VFolder["openTrigger"] })}>
                <option value="started">开始后开放</option>
                <option value="done">完成后开放</option>
              </select>
            </div>
          )}
        </div>
        <Alert>{a.error}</Alert>
      </div>
    </Modal>
  );
}

export function NameDialog({ title, initial, onSave, onClose }: { title: string; initial?: string; onSave: (n: string) => Promise<ActionResult<unknown>>; onClose: () => void }) {
  const router = useRouter();
  const a = useAction();
  const [n, setN] = useState(initial ?? "");
  return (
    <Modal open onClose={onClose} title={title}
      footer={<><button className="btn-secondary" onClick={onClose}>取消</button><button className="btn-primary" disabled={a.pending} onClick={() => a.exec(() => onSave(n), () => { onClose(); router.refresh(); })}>保存</button></>}>
      <input className="input" autoFocus value={n} onChange={(e) => setN(e.target.value)} onKeyDown={(e) => e.key === "Enter" && a.exec(() => onSave(n), () => { onClose(); router.refresh(); })} placeholder="目录名称" />
      <div className="mt-3"><Alert>{a.error}</Alert></div>
    </Modal>
  );
}
export { createFolder, renameFolder };

/* ------------------------------ 上传 ------------------------------ */

export function UploadDialog({ projectId, folder, storage, faCodes, ddCodes, onClose }: {
  projectId: string; folder: VFolder; storage: "blob" | "local"; faCodes: CodeOpt[]; ddCodes: CodeOpt[]; onClose: () => void;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [meta, setMeta] = useState({ taskCode: "", ddCode: "", description: "" });
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);

  async function start() {
    setBusy(true);
    setError(null);
    let ok = 0;
    for (const file of files) {
      try {
        if (storage === "blob") {
          const r = await blobUpload(`vdr/${projectId}/${file.name}`, file, {
            access: "private",
            handleUploadUrl: `/p/${projectId}/vdr/upload`,
            onUploadProgress: (e) => setProgress((p) => ({ ...p, [file.name]: e.percentage })),
          });
          const reg = await registerFile(projectId, { folderId: folder.id, name: file.name, key: r.pathname, size: file.size, contentType: file.type || null, ...meta });
          if (!reg.ok) throw new Error(reg.error);
        } else {
          const fd = new FormData();
          fd.set("file", file);
          fd.set("folderId", folder.id);
          Object.entries(meta).forEach(([k, v]) => fd.set(k, v));
          setProgress((p) => ({ ...p, [file.name]: 30 }));
          const r = await fetch(`/p/${projectId}/vdr/upload-local`, { method: "POST", body: fd });
          if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "上传失败");
        }
        setProgress((p) => ({ ...p, [file.name]: 100 }));
        ok++;
        setDone(ok);
      } catch (e) {
        setError(`「${file.name}」上传失败：${e instanceof Error ? e.message : e}`);
        break;
      }
    }
    setBusy(false);
    router.refresh();
    if (ok === files.length) onClose();
  }

  return (
    <Modal open onClose={() => !busy && onClose()} width="max-w-2xl" title={<span className="flex items-center gap-2"><Upload size={15} />上传到「{folder.name}」</span>}
      footer={<><button className="btn-secondary" disabled={busy} onClick={onClose}>取消</button><button className="btn-primary" disabled={busy || !files.length} onClick={start}>{busy ? `上传中 ${done}/${files.length}…` : `上传 ${files.length || ""} 个文件`}</button></>}>
      <div className="space-y-4">
        <button type="button" onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); setFiles([...files, ...Array.from(e.dataTransfer.files)]); }}
          className="flex w-full flex-col items-center rounded-lg border border-dashed border-line-strong bg-ink-950/50 px-6 py-6 hover:border-brand-sage">
          <Upload size={22} className="text-brand-sage" />
          <div className="mt-2 text-sm text-brand-paper">点击选择或拖入文件（可多选）</div>
          <div className="mt-1 text-2xs text-brand-sage">单个文件最大 500MB；PDF、图片、Word、Excel 支持在线阅览，其他格式仅 O 级可下载</div>
        </button>
        <input ref={input} type="file" multiple className="hidden" onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
        {files.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-md border border-line">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-line px-3 py-1.5 text-xs last:border-0">
                <FileText size={13} className="text-brand-sage" />
                <span className="flex-1 truncate text-brand-mist">{f.name}</span>
                <span className="font-num text-brand-sage">{fmtSize(f.size)}</span>
                {progress[f.name] !== undefined ? <span className="w-10 text-right font-num text-brand-sage">{Math.round(progress[f.name])}%</span>
                  : !busy && <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-brand-sage hover:text-danger"><Trash2 size={12} /></button>}
              </div>
            ))}
          </div>
        )}
        <CodeFields faCodes={faCodes} ddCodes={ddCodes} value={meta} onChange={setMeta} />
        <p className="text-2xs text-brand-sage">以上分类将应用于本次上传的全部文件，之后可逐个修改。新上传文件继承所在目录的权限。</p>
        <Alert>{error}</Alert>
      </div>
    </Modal>
  );
}

function CodeFields({ faCodes, ddCodes, value, onChange }: { faCodes: CodeOpt[]; ddCodes: CodeOpt[]; value: { taskCode: string; ddCode: string; description: string }; onChange: (v: { taskCode: string; ddCode: string; description: string }) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="label">项目任务编码（FA 任务编号，选填）</label>
        <input className="input font-num" list="vdr-fa-codes" value={value.taskCode} onChange={(e) => onChange({ ...value, taskCode: e.target.value.trim() })} placeholder="如 P4-03" />
        <datalist id="vdr-fa-codes">{faCodes.map((c) => <option key={c.code} value={c.code}>{c.title}</option>)}</datalist>
        {value.taskCode && <div className="mt-1 truncate text-2xs text-brand-sage">{faCodes.find((c) => c.code === value.taskCode)?.title ?? "⚠ 未找到该任务编号"}</div>}
      </div>
      <div>
        <label className="label">材料编码（DD 材料前缀编码，选填）</label>
        <input className="input font-num" list="vdr-dd-codes" value={value.ddCode} onChange={(e) => onChange({ ...value, ddCode: e.target.value.trim() })} placeholder="如 S2-Fin-Acct-01" />
        <datalist id="vdr-dd-codes">{ddCodes.map((c) => <option key={c.code} value={c.code}>{c.title}</option>)}</datalist>
        {value.ddCode && <div className="mt-1 truncate text-2xs text-brand-sage">{ddCodes.find((c) => c.code === value.ddCode)?.title ?? "⚠ 未找到该材料编码"}</div>}
      </div>
      <div className="col-span-2"><label className="label">说明（选填）</label><input className="input" value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} /></div>
    </div>
  );
}

export function FileEditDialog({ projectId, file, faCodes, ddCodes, onClose }: { projectId: string; file: VFile; faCodes: CodeOpt[]; ddCodes: CodeOpt[]; onClose: () => void }) {
  const router = useRouter();
  const a = useAction();
  const [name, setName] = useState(file.name);
  const [meta, setMeta] = useState({ taskCode: file.taskCode ?? "", ddCode: file.ddCode ?? "", description: file.description ?? "" });
  return (
    <Modal open onClose={onClose} width="max-w-2xl" title="文件信息"
      footer={<><button className="btn-secondary" onClick={onClose}>取消</button><button className="btn-primary" disabled={a.pending} onClick={() => a.exec(() => updateFile(projectId, file.id, { name, ...meta }), () => { onClose(); router.refresh(); })}>保存</button></>}>
      <div className="space-y-3">
        <div><label className="label">文件名</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <CodeFields faCodes={faCodes} ddCodes={ddCodes} value={meta} onChange={setMeta} />
        <div className="text-2xs text-brand-sage">上传：{file.uploadedBy} · {fmtDateTime(file.createdAt)} · {fmtSize(file.size)}</div>
        <Alert>{a.error}</Alert>
      </div>
    </Modal>
  );
}

/* ------------------------------ 权限 ------------------------------ */

export function PermDialog({ projectId, target, folders, perms, members, onClose }: {
  projectId: string; target: { type: "folder" | "file"; id: string; name: string; folderId: string | null }; folders: VFolder[]; perms: VPerm[]; members: VMember[]; onClose: () => void;
}) {
  const router = useRouter();
  const a = useAction();
  const own = perms.filter((p) => p.targetType === target.type && p.targetId === target.id);
  const [groupLv, setGroupLv] = useState<Record<string, VdrLevel | "">>(Object.fromEntries(VDR_GROUPS.map((g) => [g.code, own.find((p) => p.subjectType === "group" && p.subject === g.code)?.level ?? ""])));
  const [userLv, setUserLv] = useState<{ id: string; level: VdrLevel }[]>(own.filter((p) => p.subjectType === "user").map((p) => ({ id: p.subject, level: p.level })));
  const [addUser, setAddUser] = useState("");
  const others = useMemo(() => perms.filter((p) => !(p.targetType === target.type && p.targetId === target.id)), [perms, target]);
  const inherited = (group: VdrGroup | null, userId?: string) => {
    const R = makeResolver(folders, others, { userId: userId ?? "__none__", isManager: false, group, organization: null });
    if (target.type === "file") return R.fileLevel({ id: target.id, folderId: target.folderId! });
    return target.folderId ? R.folderLevel(target.folderId) : R.folderLevel("__root__");
  };
  const save = () => {
    const entries: PermEntry[] = [
      ...VDR_GROUPS.map((g) => ({ subjectType: "group" as const, subject: g.code, level: (groupLv[g.code] || null) as VdrLevel | null })),
      ...userLv.map((u) => ({ subjectType: "user" as const, subject: u.id, level: u.level })),
    ];
    a.exec(() => setPermissions(projectId, target.type, target.id, entries), () => { onClose(); router.refresh(); });
  };
  const LevelSelect = ({ value, onChange, inheritLabel }: { value: VdrLevel | ""; onChange: (v: VdrLevel | "") => void; inheritLabel?: VdrLevel }) => (
    <div className="flex gap-1">
      {inheritLabel !== undefined && (
        <button type="button" onClick={() => onChange("")} className={cn("rounded border px-2 py-1 text-2xs", value === "" ? "border-brand-sage bg-ink-700 text-brand-paper" : "border-line text-brand-sage hover:text-brand-mist")}>
          继承 <span style={{ color: levelMeta(inheritLabel).color }}>{levelMeta(inheritLabel).short}</span>
        </button>
      )}
      {LEVELS.map((l) => (
        <button key={l.code} type="button" title={l.label} onClick={() => onChange(l.code)}
          className={cn("w-8 rounded border py-1 font-num text-xs font-semibold", value === l.code ? "bg-ink-700" : "border-line opacity-60 hover:opacity-100")}
          style={{ color: l.color, borderColor: value === l.code ? l.color : undefined }}>
          {l.short}
        </button>
      ))}
    </div>
  );
  return (
    <Modal open onClose={onClose} width="max-w-2xl" title={<span>权限设置 · <span className="text-brand-sage">{target.type === "folder" ? "目录" : "文件"}</span> {target.name}</span>}
      footer={<><button className="btn-secondary" onClick={onClose}>取消</button><button className="btn-primary" disabled={a.pending} onClick={save}>保存权限</button></>}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-3 text-2xs text-brand-sage">
          {LEVELS.map((l) => <span key={l.code}><span className="font-num font-semibold" style={{ color: l.color }}>{l.short}</span> {l.label}</span>)}
          <span>· 规则就近生效：用户 &gt; 权限组；文件 &gt; 所在目录 &gt; 上级目录</span>
        </div>
        <div>
          <div className="eyebrow mb-2">按权限组</div>
          <div className="divide-y divide-line rounded-md border border-line">
            {VDR_GROUPS.map((g) => (
              <div key={g.code} className="flex items-center gap-3 px-3 py-2">
                <div className="w-40"><span className="font-num text-sm text-brand-paper">{g.code}</span><span className="ml-2 text-2xs text-brand-sage">{g.desc}</span></div>
                <div className="ml-auto"><LevelSelect value={groupLv[g.code]} onChange={(v) => setGroupLv({ ...groupLv, [g.code]: v })} inheritLabel={inherited(g.code)} /></div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="eyebrow mb-2">按用户（覆盖其权限组设置）</div>
          <div className="space-y-1.5">
            {userLv.map((u, i) => {
              const m = members.find((x) => x.id === u.id);
              return (
                <div key={u.id} className="flex items-center gap-3 rounded-md border border-line px-3 py-2">
                  <div className="min-w-0 flex-1 text-sm text-brand-paper">{m?.name ?? "（已移出项目）"}<span className="ml-2 text-2xs text-brand-sage">{m?.group ?? "未分组"} · {m?.organization ?? ""}</span></div>
                  <LevelSelect value={u.level} onChange={(v) => v && setUserLv(userLv.map((x, j) => (j === i ? { ...x, level: v } : x)))} />
                  <button className="text-brand-sage hover:text-danger" onClick={() => setUserLv(userLv.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
                </div>
              );
            })}
            <div className="flex gap-2">
              <select className="input text-xs" value={addUser} onChange={(e) => setAddUser(e.target.value)}>
                <option value="">选择要单独设置的用户…</option>
                {members.filter((m) => !userLv.some((u) => u.id === m.id) && m.role !== "project_admin").map((m) => <option key={m.id} value={m.id}>{m.name}（{m.group ?? "未分组"}{m.organization ? ` · ${m.organization}` : ""}）</option>)}
              </select>
              <button className="btn-secondary" disabled={!addUser} onClick={() => { const m = members.find((x) => x.id === addUser)!; setUserLv([...userLv, { id: addUser, level: inherited((m.group as VdrGroup) ?? null, addUser) }]); setAddUser(""); }}>添加</button>
            </div>
          </div>
        </div>
        <Alert>{a.error}</Alert>
      </div>
    </Modal>
  );
}

/* ------------------------------ 解锁 / 日志 ------------------------------ */

export function UnlockDialog({ projectId, phase, onClose }: { projectId: string; phase: VFolder; onClose: () => void }) {
  const router = useRouter();
  const a = useAction();
  const [pw, setPw] = useState("");
  const go = () => a.exec(() => unlockPhase(projectId, phase.id, pw), () => { onClose(); router.refresh(); });
  return (
    <Modal open onClose={onClose} title={<span className="flex items-center gap-2"><Lock size={15} />进入 {phase.name}</span>}
      footer={<><button className="btn-secondary" onClick={onClose}>取消</button><button className="btn-primary" disabled={a.pending || !pw} onClick={go}>进入</button></>}>
      <p className="mb-3 text-sm text-brand-mist">该 Phase 区受密码保护，请输入 FA 提供的访问密码。</p>
      <input className="input font-mono" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && pw && go()} />
      <div className="mt-3"><Alert>{a.error}</Alert></div>
    </Modal>
  );
}

type LogRow = { id: string; action: string; at: string; user: string; file: string; detail: Record<string, unknown> };
export function LogDialog({ projectId, folder, onClose }: { projectId: string; folder: VFolder; onClose: () => void }) {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    folderLog(projectId, folder.id).then((r) => (r.ok ? setRows((r.data as LogRow[]) ?? []) : setError(r.error)));
  }, [projectId, folder.id]);
  const a = { error };
  return (
    <Modal open onClose={onClose} width="max-w-3xl" title={`操作记录 · ${folder.name}`}>
      <Alert>{a.error}</Alert>
      {rows === null ? <div className="py-8 text-center text-xs text-brand-sage">加载中…</div> : rows.length === 0 ? <div className="py-8 text-center text-xs text-brand-sage">暂无记录</div> : (
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead><tr><th className="th">时间</th><th className="th">操作人</th><th className="th">动作</th><th className="th">对象</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="td whitespace-nowrap font-num text-brand-sage">{fmtDateTime(r.at)}</td>
                  <td className="td">{r.user}</td>
                  <td className="td"><span className={r.action.includes("delete") || r.action === "purge" ? "text-danger" : ""}>{VDR_ACTION_LABEL[r.action] ?? r.action}</span></td>
                  <td className="td text-brand-mist">{r.file || String(r.detail?.name ?? r.detail?.to ?? "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
