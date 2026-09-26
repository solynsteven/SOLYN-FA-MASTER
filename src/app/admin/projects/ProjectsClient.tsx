"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Settings2, ChevronRight } from "lucide-react";
import { Alert, Badge, Modal, useAction } from "@/components/ui";
import { createProject, deleteProject, setProjectStatus } from "../actions";
import { MODULES } from "@/lib/modules";
import { fmtDate } from "@/lib/format";

type P = {
  id: string; code: string; name: string; clientName: string; dealType: string; status: "active" | "on_hold" | "closed";
  createdAt: string; members: number; fa: number; dd: number; modules: string[];
};
type U = { id: string; name: string; email: string };

export function ProjectsClient({ projects, users }: { projects: P[]; users: U[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<P | null>(null);
  const st = useAction();
  return (
    <>
      <div className="mb-4 flex justify-end">
        <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={15} />新建项目</button>
      </div>
      <Alert>{st.error}</Alert>
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th w-28">代号</th><th className="th">项目名称</th><th className="th">委托方</th><th className="th">启用模块</th>
              <th className="th w-20 text-right">成员</th><th className="th w-24 text-right">FA / DD</th><th className="th w-28">状态</th>
              <th className="th w-28">创建日期</th><th className="th w-40" />
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className="hover:bg-ink-850/60">
                <td className="td font-num tracking-wider text-brand-paper">{p.code}</td>
                <td className="td text-brand-paper">{p.name}{p.dealType && <div className="text-2xs text-brand-sage">{p.dealType}</div>}</td>
                <td className="td text-brand-sage">{p.clientName || "—"}</td>
                <td className="td">
                  <div className="flex flex-wrap gap-1">
                    {MODULES.filter((m) => p.modules.includes(m.key)).map((m) => <Badge key={m.key} tone="outline">{m.label}</Badge>)}
                  </div>
                </td>
                <td className="td text-right font-num">{p.members}</td>
                <td className="td text-right font-num">{p.fa} / {p.dd}</td>
                <td className="td">
                  <select
                    className="input py-1 text-xs"
                    value={p.status}
                    onChange={(e) => st.exec(() => setProjectStatus(p.id, e.target.value as P["status"]), () => router.refresh())}
                  >
                    <option value="active">进行中</option>
                    <option value="on_hold">暂停</option>
                    <option value="closed">已关闭</option>
                  </select>
                </td>
                <td className="td font-num text-xs text-brand-sage">{fmtDate(p.createdAt)}</td>
                <td className="td">
                  <div className="flex justify-end gap-1">
                    <Link href={`/p/${p.id}/settings`} className="btn-ghost btn-sm" title="项目管理"><Settings2 size={14} /></Link>
                    <button className="btn-ghost btn-sm text-danger hover:text-danger" title="删除" onClick={() => setDeleting(p)}><Trash2 size={14} /></button>
                    <Link href={`/p/${p.id}`} className="btn-ghost btn-sm">进入<ChevronRight size={13} /></Link>
                  </div>
                </td>
              </tr>
            ))}
            {projects.length === 0 && <tr><td colSpan={9} className="td py-12 text-center text-brand-sage">还没有项目，点击右上角「新建项目」开始</td></tr>}
          </tbody>
        </table>
      </div>
      <CreateProjectModal open={creating} onClose={() => setCreating(false)} users={users} />
      {deleting && <DeleteProjectModal p={deleting} onClose={() => setDeleting(null)} />}
    </>
  );
}

function CreateProjectModal({ open, onClose, users }: { open: boolean; onClose: () => void; users: U[] }) {
  const router = useRouter();
  const a = useAction();
  const init = { code: "", name: "", clientName: "", dealType: "", description: "", adminUserId: "", modules: MODULES.map((m) => m.key) as string[] };
  const [f, setF] = useState(init);
  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title="新建项目"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button
            className="btn-primary"
            disabled={a.pending}
            onClick={() =>
              a.exec(() => createProject({ ...f, adminUserId: f.adminUserId || undefined }), (r) => {
                onClose();
                setF(init);
                const id = (r.data as { id: string } | undefined)?.id;
                if (id) router.push(`/p/${id}/settings`);
                else router.refresh();
              })
            }
          >
            创建项目
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">项目代号 *</label><input className="input font-num uppercase tracking-wider" placeholder="如 QSGJ-2026" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></div>
        <div><label className="label">项目名称 *</label><input className="input" placeholder="如 青山国际并购项目" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label className="label">委托方 / 客户</label><input className="input" value={f.clientName} onChange={(e) => setF({ ...f, clientName: e.target.value })} /></div>
        <div>
          <label className="label">交易类型</label>
          <input className="input" list="deal-types" value={f.dealType} onChange={(e) => setF({ ...f, dealType: e.target.value })} />
          <datalist id="deal-types">
            {["买方并购", "卖方并购", "股权融资", "债权融资", "Pre-IPO", "重组"].map((x) => <option key={x} value={x} />)}
          </datalist>
        </div>
        <div className="col-span-2"><label className="label">项目简介</label><textarea className="input min-h-[64px]" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div className="col-span-2">
          <label className="label">启用的业务模块</label>
          <div className="grid grid-cols-3 gap-2">
            {MODULES.map((m) => {
              const on = f.modules.includes(m.key);
              return (
                <label key={m.key} className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition ${on ? "border-brand-mid bg-brand-green/15" : "border-line"}`}>
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-[#3F6E58]"
                    checked={on}
                    onChange={() => setF({ ...f, modules: on ? f.modules.filter((x) => x !== m.key) : [...f.modules, m.key] })}
                  />
                  <span>
                    <span className="block text-sm text-brand-paper">{m.label}</span>
                    <span className="block text-2xs text-brand-sage">{m.ready ? m.en : "规划中"}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <div className="col-span-2">
          <label className="label">指定项目管理员（可选，之后也可在项目管理中添加）</label>
          <select className="input" value={f.adminUserId} onChange={(e) => setF({ ...f, adminUserId: e.target.value })}>
            <option value="">暂不指定</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}
          </select>
        </div>
      </div>
      <p className="mt-3 text-2xs leading-5 text-brand-sage">创建后会为 FA 项目管理与 DD 管理生成一套默认字段，可在「项目管理 → 字段配置」中增删改。</p>
      <div className="mt-3"><Alert>{a.error}</Alert></div>
    </Modal>
  );
}

function DeleteProjectModal({ p, onClose }: { p: P; onClose: () => void }) {
  const router = useRouter();
  const a = useAction();
  const [code, setCode] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      title="删除项目"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button
            className="btn border border-danger/50 bg-danger/15 text-danger hover:bg-danger/25"
            disabled={a.pending || code.trim().toUpperCase() !== p.code}
            onClick={() => a.exec(() => deleteProject(p.id, code), () => { onClose(); router.refresh(); })}
          >
            永久删除
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-brand-mist">
        将永久删除项目 <b className="text-brand-paper">{p.name}</b> 及其全部任务记录（FA {p.fa} 条、DD {p.dd} 条）、字段配置、成员关系与变更历史，无法恢复。
      </p>
      <label className="label mt-4">请输入项目代号 <span className="font-num text-brand-paper">{p.code}</span> 以确认</label>
      <input className="input font-num uppercase" value={code} onChange={(e) => setCode(e.target.value)} />
      <div className="mt-3"><Alert>{a.error}</Alert></div>
    </Modal>
  );
}
