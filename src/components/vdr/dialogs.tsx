"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Lock, FileText, Trash2 } from "lucide-react";
import { upload as blobUpload, uploadPresigned } from "@vercel/blob/client";
import { Alert, Modal, Toggle, useAction, cn } from "@/components/ui";
import { LEVELS, CAPS, DOWNLOAD_MODES, levelMeta, levelOf, normCaps, capsOfLevel, fmtSize, VDR_ACTION_LABEL } from "@/lib/vdr/constants";
import { inheritedCaps } from "@/lib/vdr/resolve";
import { fmtDateTime } from "@/lib/format";
import type { VdrLevel, VdrCap, VdrSecurity, VdrDownloadMode } from "@/db/schema";
import type { ActionResult } from "@/lib/action";
import {
  createPhase, updatePhase, createFolder, renameFolder, registerFile, updateFile, setPermissions, setSecurity, shareFile, unlockPhase, folderLog, type PermEntry,
} from "@/app/p/[projectId]/vdr/actions";
import type { VFolder, VFile, VPerm, VMember, VGroup, CodeOpt } from "./types";

export function LevelTag({ lv, className }: { lv: VdrLevel; className?: string }) {
  const m = levelMeta(lv);
  return (
    <span title={`L${m.short} ${m.label}`} className={cn("inline-flex h-4 min-w-4 items-center justify-center rounded px-1 font-num text-[10px] font-semibold", className)} style={{ color: m.color, border: `1px solid ${m.color}66` }}>
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

export function UploadDialog({ projectId, folder, storage, blobAccess, blobAuth, faCodes, ddCodes, onClose }: {
  projectId: string; folder: VFolder; storage: "blob" | "local" | "none"; blobAccess: "public" | "private"; blobAuth: "token" | "oidc" | null; faCodes: CodeOpt[]; ddCodes: CodeOpt[]; onClose: () => void;
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
    if (storage === "blob") {
      // 先自检存储配置与认证，失败时直接显示具体原因（SDK 本身只会报「上传失败」）
      const pr = await fetch(`/p/${projectId}/vdr/upload`).then((r) => r.json()).catch(() => null) as { ok: boolean; error?: string } | null;
      if (!pr?.ok) {
        setError(pr?.error ?? "无法连接上传服务，请稍后重试");
        setBusy(false);
        return;
      }
    }
    for (const file of files) {
      try {
        if (storage === "blob") {
          // 存储路径只用 ASCII（文件名原文另存数据库），避免中日文、全角符号在存储路径中出问题
          const ext = (file.name.match(/\.([A-Za-z0-9]{1,10})$/)?.[1] ?? "bin").toLowerCase();
          const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const r = await (blobAuth === "oidc" ? uploadPresigned : blobUpload)(`vdr/${projectId}/${id}.${ext}`, file, {
            access: blobAccess,
            contentType: file.type || undefined,
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
          if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `服务器返回 ${r.status}`);
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
      footer={<><button className="btn-secondary" disabled={busy} onClick={onClose}>取消</button><button className="btn-primary" disabled={busy || !files.length || storage === "none"} onClick={start}>{busy ? `上传中 ${done}/${files.length}…` : `上传 ${files.length || ""} 个文件`}</button></>}>
      <div className="space-y-4">
        {storage === "none" && (
          <Alert>尚未配置文件存储，暂时无法上传。请在 Vercel 项目 → Storage 中创建 Blob 存储（Access 选 Private），Connect 到本项目后 Redeploy。</Alert>
        )}
        <button type="button" onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); setFiles([...files, ...Array.from(e.dataTransfer.files)]); }}
          className="flex w-full flex-col items-center rounded-lg border border-dashed border-line-strong bg-ink-950/50 px-6 py-6 hover:border-brand-sage">
          <Upload size={22} className="text-brand-sage" />
          <div className="mt-2 text-sm text-brand-paper">点击选择或拖入文件（可多选）</div>
          <div className="mt-1 text-2xs text-brand-sage">单个文件最大 500MB；PDF、图片、Word、Excel 支持在线分页预览与水印 / IRM 下载，其他格式只能按策略下载原件</div>
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

/** 8 级预设 + 9 个独立开关；选「继承」则沿用上级目录 / 权限组默认值 */
export function CapsEditor({ value, inherit, onChange, allowInherit = true }: { value: VdrCap[] | null; inherit: VdrCap[]; onChange: (v: VdrCap[] | null) => void; allowInherit?: boolean }) {
  const eff = value ?? inherit;
  const lv = levelOf(eff);
  const toggle = (c: VdrCap) => {
    const cur = new Set(eff);
    if (cur.has(c)) {
      cur.delete(c);
      if (c === "view") cur.clear();
      if (c === "preview") ["download", "print", "copy", "annotate"].forEach((x) => cur.delete(x as VdrCap));
    } else cur.add(c);
    onChange(normCaps([...cur]));
  };
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {allowInherit && (
          <button type="button" onClick={() => onChange(null)} className={cn("rounded border px-2 py-0.5 text-2xs", value === null ? "border-brand-sage bg-ink-700 text-brand-paper" : "border-line text-brand-sage hover:text-brand-mist")}>
            继承 <span style={{ color: levelMeta(levelOf(inherit)).color }}>{levelMeta(levelOf(inherit)).short}</span>
          </button>
        )}
        {LEVELS.map((l) => (
          <button key={l.code} type="button" title={`L${l.short} ${l.label}`} onClick={() => onChange(capsOfLevel(l.code))}
            className={cn("w-7 rounded border py-0.5 font-num text-xs font-semibold", value !== null && lv === l.code ? "bg-ink-700" : "border-line opacity-60 hover:opacity-100")}
            style={{ color: l.color, borderColor: value !== null && lv === l.code ? l.color : undefined }}>
            {l.short}
          </button>
        ))}
        <span className="ml-1 text-2xs" style={{ color: levelMeta(lv).color }}>{lv === "C" ? "自定义" : levelMeta(lv).label}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {CAPS.map((c) => {
          const on = eff.includes(c.key);
          return (
            <button key={c.key} type="button" title={c.desc} onClick={() => toggle(c.key)}
              className={cn("rounded-full border px-2 py-0.5 text-[11px] transition", on ? "border-brand-mid bg-brand-green/40 text-brand-paper" : "border-line text-brand-sage/70 hover:text-brand-mist", value === null && "opacity-60")}>
              {on ? "✓ " : ""}{c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PermDialog({ projectId, target, folders, perms, members, groups, onClose }: {
  projectId: string; target: { type: "folder" | "file"; id: string; name: string; folderId: string | null }; folders: VFolder[]; perms: VPerm[]; members: VMember[]; groups: VGroup[]; onClose: () => void;
}) {
  const router = useRouter();
  const a = useAction();
  const own = perms.filter((p) => p.targetType === target.type && p.targetId === target.id);
  const defaults = useMemo(() => Object.fromEntries(groups.map((g) => [g.code, g.defaultCaps])), [groups]);
  const [groupCaps, setGroupCaps] = useState<Record<string, VdrCap[] | null>>(Object.fromEntries(groups.map((g) => [g.code, own.find((p) => p.subjectType === "group" && p.subject === g.code)?.caps ?? null])));
  const [userCaps, setUserCaps] = useState<{ id: string; caps: VdrCap[]; expiresAt: string | null }[]>(own.filter((p) => p.subjectType === "user").map((p) => ({ id: p.subject, caps: p.caps, expiresAt: p.expiresAt })));
  const [addUser, setAddUser] = useState("");
  const inherit = (group: string | null, userId?: string) => inheritedCaps(folders, perms, defaults, { userId, group }, target);
  const save = () => {
    const entries: PermEntry[] = [
      ...groups.map((g) => ({ subjectType: "group" as const, subject: g.code, caps: groupCaps[g.code] })),
      ...userCaps.map((u) => ({ subjectType: "user" as const, subject: u.id, caps: u.caps, expiresAt: u.expiresAt })),
    ];
    a.exec(() => setPermissions(projectId, target.type, target.id, entries), () => { onClose(); router.refresh(); });
  };
  return (
    <Modal open onClose={onClose} width="max-w-3xl" title={<span>权限设置 · <span className="text-brand-sage">{target.type === "folder" ? "目录" : "文件"}</span> {target.name}</span>}
      footer={<><button className="btn-secondary" onClick={onClose}>取消</button><button className="btn-primary" disabled={a.pending} onClick={save}>保存权限</button></>}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-2xs text-brand-sage">
          {LEVELS.map((l) => <span key={l.code}><span className="font-num font-semibold" style={{ color: l.color }}>{l.short}</span> {l.label}</span>)}
          <span>· 规则就近生效：用户 &gt; 权限组；文件 &gt; 所在目录 &gt; 上级目录 &gt; 权限组默认</span>
        </div>
        <div>
          <div className="eyebrow mb-2">按权限组</div>
          <div className="divide-y divide-line rounded-md border border-line">
            {groups.map((g) => (
              <div key={g.code} className="flex flex-wrap items-start gap-3 px-3 py-2.5">
                <div className="w-36 shrink-0"><div className="font-num text-sm text-brand-paper">{g.code}</div><div className="text-2xs text-brand-sage">{g.name}</div></div>
                <div className="min-w-0 flex-1"><CapsEditor value={groupCaps[g.code]} inherit={inherit(g.code)} onChange={(v) => setGroupCaps({ ...groupCaps, [g.code]: v })} /></div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="eyebrow mb-2">按用户（覆盖其权限组设置，可设到期）</div>
          <div className="space-y-1.5">
            {userCaps.map((u, i) => {
              const m = members.find((x) => x.id === u.id);
              return (
                <div key={u.id} className="rounded-md border border-line px-3 py-2">
                  <div className="mb-1.5 flex items-center gap-2">
                    <div className="min-w-0 flex-1 text-sm text-brand-paper">{m?.name ?? "（已移出项目）"}<span className="ml-2 text-2xs text-brand-sage">{m?.group ?? "未分组"}{m?.organization ? ` · ${m.organization}` : ""}</span></div>
                    <label className="flex items-center gap-1 text-2xs text-brand-sage">到期
                      <input type="date" className="input w-36 py-0.5 text-2xs [color-scheme:dark]" value={u.expiresAt?.slice(0, 10) ?? ""} onChange={(e) => setUserCaps(userCaps.map((x, j) => (j === i ? { ...x, expiresAt: e.target.value ? new Date(e.target.value + "T23:59:59+09:00").toISOString() : null } : x)))} />
                    </label>
                    <button className="text-brand-sage hover:text-danger" onClick={() => setUserCaps(userCaps.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
                  </div>
                  <CapsEditor value={u.caps} allowInherit={false} inherit={u.caps} onChange={(v) => v && setUserCaps(userCaps.map((x, j) => (j === i ? { ...x, caps: v } : x)))} />
                </div>
              );
            })}
            <div className="flex gap-2">
              <select className="input text-xs" value={addUser} onChange={(e) => setAddUser(e.target.value)}>
                <option value="">选择要单独设置的用户…</option>
                {members.filter((m) => !userCaps.some((u) => u.id === m.id) && m.role !== "project_admin").map((m) => <option key={m.id} value={m.id}>{m.name}（{m.group ?? "未分组"}{m.organization ? ` · ${m.organization}` : ""}）</option>)}
              </select>
              <button className="btn-secondary" disabled={!addUser} onClick={() => { const m = members.find((x) => x.id === addUser)!; setUserCaps([...userCaps, { id: addUser, caps: inherit(m.group ?? null, addUser), expiresAt: null }]); setAddUser(""); }}>添加</button>
            </div>
          </div>
        </div>
        <Alert>{a.error}</Alert>
      </div>
    </Modal>
  );
}

/* ------------------------------ 文档安全策略 ------------------------------ */

export function SecurityDialog({ projectId, target, own, inherited, onClose }: {
  projectId: string; target: { type: "folder" | "file"; id: string; name: string }; own: VdrSecurity | null;
  inherited: { fence: boolean; downloadModes: VdrDownloadMode[]; irmExpiryDays: number; irmPrintLimit: number }; onClose: () => void;
}) {
  const router = useRouter();
  const a = useAction();
  const [fence, setFence] = useState<boolean | null>(own?.fence ?? null);
  const [modes, setModes] = useState<VdrDownloadMode[] | null>(own?.downloadModes ?? null);
  const [days, setDays] = useState<number | null>(own?.irmExpiryDays ?? null);
  const [prints, setPrints] = useState<number | null>(own?.irmPrintLimit ?? null);
  const Tri = ({ v, set, label }: { v: boolean | null; set: (x: boolean | null) => void; label: [string, string] }) => (
    <div className="flex gap-1">
      {([[null, `继承（${inherited.fence ? label[0] : label[1]}）`], [true, label[0]], [false, label[1]]] as const).map(([k, l]) => (
        <button key={String(k)} type="button" onClick={() => set(k)} className={cn("rounded border px-2.5 py-1 text-xs", v === k ? "border-brand-sage bg-ink-700 text-brand-paper" : "border-line text-brand-sage hover:text-brand-mist")}>{l}</button>
      ))}
    </div>
  );
  const effModes = modes ?? inherited.downloadModes;
  return (
    <Modal open onClose={onClose} width="max-w-2xl" title={<span>文档安全策略 · <span className="text-brand-sage">{target.type === "folder" ? "目录" : "文件"}</span> {target.name}</span>}
      footer={<><button className="btn-secondary" onClick={onClose}>取消</button><button className="btn-primary" disabled={a.pending} onClick={() => a.exec(() => setSecurity(projectId, target.type, target.id, { fence, downloadModes: modes, irmExpiryDays: days, irmPrintLimit: prints }), () => { onClose(); router.refresh(); })}>保存策略</button></>}>
      <div className="space-y-5">
        <div>
          <div className="label">Fence View 围栏视图</div>
          <Tri v={fence} set={setFence} label={["开启", "关闭"]} />
          <p className="mt-1 text-2xs text-brand-sage">开启后预览时只有鼠标附近一小块区域清晰可见，其余被条纹遮挡，用于对抗手机拍照、翻拍。适合高敏感材料（管理层面谈记录、价格条款等）。</p>
        </div>
        <div>
          <div className="label flex items-center gap-2">允许的下载方式
            <button type="button" className={cn("rounded border px-2 py-0.5 text-2xs", modes === null ? "border-brand-sage bg-ink-700 text-brand-paper" : "border-line text-brand-sage")} onClick={() => setModes(null)}>继承</button>
          </div>
          <div className="space-y-1.5">
            {DOWNLOAD_MODES.map((m) => {
              const on = effModes.includes(m.key);
              return (
                <label key={m.key} className={cn("flex cursor-pointer gap-2 rounded-md border px-3 py-2", on ? "border-brand-mid/60 bg-brand-green/10" : "border-line", modes === null && "opacity-70")}>
                  <input type="checkbox" className="mt-0.5 accent-[#3F6E58]" checked={on} onChange={() => setModes(on ? effModes.filter((x) => x !== m.key) : [...effModes, m.key])} />
                  <span><span className="text-sm text-brand-paper">{m.label}</span><span className="block text-2xs text-brand-sage">{m.desc}</span></span>
                </label>
              );
            })}
          </div>
          <p className="mt-1 text-2xs text-brand-sage">用户还须拥有「下载」开关才能下载；全部取消勾选 = 此处任何人都不能下载（管理员除外）。</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">IRM 默认有效期（天）</label>
            <input type="number" min={1} max={365} className="input font-num" placeholder={`继承：${inherited.irmExpiryDays}`} value={days ?? ""} onChange={(e) => setDays(e.target.value ? Number(e.target.value) : null)} />
          </div>
          <div>
            <label className="label">IRM 允许打印次数</label>
            <input type="number" min={0} max={99} className="input font-num" placeholder={`继承：${inherited.irmPrintLimit}`} value={prints ?? ""} onChange={(e) => setPrints(e.target.value ? Number(e.target.value) : null)} />
          </div>
        </div>
        <Alert>{a.error}</Alert>
      </div>
    </Modal>
  );
}

/* ------------------------------ 外部分享 ------------------------------ */

export function ShareDialog({ projectId, file, canPrint, onClose }: { projectId: string; file: VFile; canPrint: boolean; onClose: () => void }) {
  const a = useAction();
  const [f, setF] = useState({ email: "", name: "", days: 7, allowPrint: false });
  const [res, setRes] = useState<{ link: string | null; mailed: boolean; existing: boolean } | null>(null);
  return (
    <Modal open onClose={onClose} title={<span>外部分享 · <span className="text-brand-sage">{file.name}</span></span>}
      footer={res ? <button className="btn-primary" onClick={onClose}>完成</button> : <><button className="btn-secondary" onClick={onClose}>取消</button><button className="btn-primary" disabled={a.pending || !f.email} onClick={() => a.exec(() => shareFile(projectId, file.id, f), (r) => setRes(r.data ?? null))}>发送邀请</button></>}>
      {res ? (
        <div className="space-y-3 text-sm text-brand-mist">
          {res.existing ? <p>对方已是项目成员，已直接为其开放该文件（到期自动收回）。</p> : (
            <>
              <p>{res.mailed ? "邀请邮件已发送。" : "未配置邮件服务，请将以下邀请链接通过安全渠道发送给对方："}</p>
              {res.link && <input readOnly className="input font-mono text-xs" value={res.link} onFocus={(e) => e.target.select()} />}
              <p className="text-2xs text-brand-sage">对方需用受邀邮箱注册登录，并按项目要求完成二次验证与 NDA 签署后，才能在线查看该文件；不会看到数据室中的其他内容。</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">对方邮箱</label><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <div><label className="label">姓名（选填）</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">有效天数</label><input type="number" min={1} max={90} className="input font-num" value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })} /></div>
            {canPrint && <label className="mt-6 flex items-center gap-2 text-xs text-brand-mist"><input type="checkbox" className="accent-[#3F6E58]" checked={f.allowPrint} onChange={(e) => setF({ ...f, allowPrint: e.target.checked })} />允许打印</label>}
          </div>
          <p className="text-2xs text-brand-sage">不开放匿名公开链接：对方只能通过邀请链接注册登录后，仅在线预览此文件（带其本人身份水印），不可下载；所有访问留痕，到期自动失效。</p>
          <Alert>{a.error}</Alert>
        </div>
      )}
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
