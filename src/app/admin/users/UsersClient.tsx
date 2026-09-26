"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, KeyRound, Trash2 } from "lucide-react";
import { Alert, Badge, ConfirmButton, Drawer, Modal, useAction } from "@/components/ui";
import { createUser, updateUser, resetPassword, deleteUser, setUserProjects } from "../actions";
import { fmtDateTime } from "@/lib/format";

type Assign = { projectId: string; role: "project_admin" | "member" };
type U = {
  id: string; name: string; email: string; title: string; globalRole: "super_admin" | "user"; isActive: boolean;
  lastLoginAt: string | null; createdAt: string; projects: Assign[];
};
type P = { id: string; name: string; code: string };

export function UsersClient({ users, projects, meId }: { users: U[]; projects: P[]; meId: string }) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<U | null>(null);
  const pmap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const list = users.filter((u) => !q || `${u.name}${u.email}${u.title}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-sage" />
          <input className="input pl-8" placeholder="搜索姓名 / 邮箱" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={15} />新建用户</button>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">姓名</th><th className="th">邮箱</th><th className="th w-32">全局角色</th>
              <th className="th">所属项目</th><th className="th w-24">状态</th><th className="th w-40">最近登录</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className="cursor-pointer hover:bg-ink-850/70" onClick={() => setEditing(u)}>
                <td className="td">
                  <div className="text-brand-paper">{u.name}{u.id === meId && <span className="ml-1.5 text-2xs text-brand-sage">（我）</span>}</div>
                  {u.title && <div className="text-2xs text-brand-sage">{u.title}</div>}
                </td>
                <td className="td text-brand-sage">{u.email}</td>
                <td className="td">{u.globalRole === "super_admin" ? <Badge tone="green">全局管理员</Badge> : <Badge>普通用户</Badge>}</td>
                <td className="td">
                  <div className="flex flex-wrap gap-1">
                    {u.globalRole === "super_admin" ? (
                      <span className="text-2xs text-brand-sage">全部项目</span>
                    ) : u.projects.length ? (
                      u.projects.map((a) => (
                        <Badge key={a.projectId} tone={a.role === "project_admin" ? "mid" : "outline"}>
                          {pmap.get(a.projectId)?.code}{a.role === "project_admin" ? " · 管理员" : ""}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-2xs text-brand-sage">—</span>
                    )}
                  </div>
                </td>
                <td className="td">{u.isActive ? <Badge tone="mid">启用</Badge> : <Badge tone="danger">停用</Badge>}</td>
                <td className="td font-num text-xs text-brand-sage">{fmtDateTime(u.lastLoginAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CreateUserModal open={creating} onClose={() => setCreating(false)} projects={projects} />
      {editing && <EditUserDrawer key={editing.id} user={editing} projects={projects} meId={meId} onClose={() => setEditing(null)} />}
    </>
  );
}

function CreateUserModal({ open, onClose, projects }: { open: boolean; onClose: () => void; projects: P[] }) {
  const router = useRouter();
  const a = useAction();
  const [f, setF] = useState({ name: "", email: "", title: "", password: "", globalRole: "user" as "user" | "super_admin", projectId: "", projectRole: "member" as Assign["role"] });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新建用户"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button
            className="btn-primary"
            disabled={a.pending}
            onClick={() =>
              a.exec(() => createUser({ ...f, projectId: f.projectId || undefined }), () => {
                onClose();
                setF({ ...f, name: "", email: "", title: "", password: "" });
                router.refresh();
              })
            }
          >
            创建
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">姓名 *</label><input className="input" value={f.name} onChange={set("name")} /></div>
        <div><label className="label">职位</label><input className="input" value={f.title} onChange={set("title")} /></div>
        <div className="col-span-2"><label className="label">邮箱（登录账号）*</label><input className="input" type="email" value={f.email} onChange={set("email")} /></div>
        <div className="col-span-2">
          <label className="label">初始密码 *（至少 8 位，请线下告知用户）</label>
          <div className="flex gap-2">
            <input className="input font-mono" value={f.password} onChange={set("password")} />
            <button type="button" className="btn-secondary" onClick={() => setF({ ...f, password: genPassword() })}>生成</button>
          </div>
        </div>
        <div className="col-span-2">
          <label className="label">全局角色</label>
          <select className="input" value={f.globalRole} onChange={set("globalRole")}>
            <option value="user">普通用户（按项目授权）</option>
            <option value="super_admin">全局管理员（可访问全部项目与后台）</option>
          </select>
        </div>
        {f.globalRole === "user" && (
          <>
            <div>
              <label className="label">加入项目（可选）</label>
              <select className="input" value={f.projectId} onChange={set("projectId")}>
                <option value="">暂不分配</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">项目角色</label>
              <select className="input" value={f.projectRole} onChange={set("projectRole")} disabled={!f.projectId}>
                <option value="member">项目用户</option>
                <option value="project_admin">项目管理员</option>
              </select>
            </div>
          </>
        )}
      </div>
      <div className="mt-3"><Alert>{a.error}</Alert></div>
    </Modal>
  );
}

export function genPassword() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint32Array(12)), (n) => c[n % c.length]).join("");
}

function EditUserDrawer({ user, projects, meId, onClose }: { user: U; projects: P[]; meId: string; onClose: () => void }) {
  const router = useRouter();
  const a = useAction();
  const b = useAction();
  const c = useAction();
  const [f, setF] = useState({ name: user.name, email: user.email, title: user.title, globalRole: user.globalRole, isActive: user.isActive });
  const [assign, setAssign] = useState<Assign[]>(user.projects);
  const [pw, setPw] = useState("");
  const toggle = (pid: string, role: Assign["role"] | null) =>
    setAssign((xs) => (role === null ? xs.filter((x) => x.projectId !== pid) : [...xs.filter((x) => x.projectId !== pid), { projectId: pid, role }]));

  return (
    <Drawer
      open
      onClose={onClose}
      title={user.name}
      subtitle={`${user.email} · 创建于 ${fmtDateTime(user.createdAt)}`}
      footer={
        user.id !== meId && (
          <ConfirmButton
            className="btn-danger mr-auto"
            title="删除用户"
            confirmText="删除"
            body={<>确定删除用户 <b className="text-brand-paper">{user.name}</b>？其项目成员关系将一并移除，历史变更记录中的操作人显示为空。此操作不可撤销，如只是暂停使用建议改为「停用」。</>}
            onConfirm={() => c.exec(() => deleteUser(user.id), () => { onClose(); router.refresh(); })}
          >
            <Trash2 size={14} />删除用户
          </ConfirmButton>
        )
      }
    >
      <div className="space-y-6 p-5">
        <section className="space-y-3">
          <div className="eyebrow">基本信息</div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">姓名</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div><label className="label">职位</label><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
            <div className="col-span-2"><label className="label">邮箱</label><input className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <div>
              <label className="label">全局角色</label>
              <select className="input" value={f.globalRole} onChange={(e) => setF({ ...f, globalRole: e.target.value as U["globalRole"] })} disabled={user.id === meId}>
                <option value="user">普通用户</option>
                <option value="super_admin">全局管理员</option>
              </select>
            </div>
            <div>
              <label className="label">账号状态</label>
              <select className="input" value={f.isActive ? "1" : "0"} onChange={(e) => setF({ ...f, isActive: e.target.value === "1" })} disabled={user.id === meId}>
                <option value="1">启用</option>
                <option value="0">停用（禁止登录）</option>
              </select>
            </div>
          </div>
          <Alert>{a.error}</Alert>
          <Alert kind="success">{a.message}</Alert>
          <button className="btn-primary" disabled={a.pending} onClick={() => a.exec(() => updateUser(user.id, f), () => router.refresh())}>保存基本信息</button>
        </section>

        <section className="space-y-3 border-t border-line pt-5">
          <div className="eyebrow">项目归属与角色</div>
          {f.globalRole === "super_admin" ? (
            <p className="text-xs text-brand-sage">全局管理员默认可访问并管理全部项目，无需单独分配。</p>
          ) : projects.length === 0 ? (
            <p className="text-xs text-brand-sage">系统中还没有项目。</p>
          ) : (
            <>
              <div className="overflow-hidden rounded-md border border-line">
                {projects.map((p) => {
                  const cur = assign.find((x) => x.projectId === p.id)?.role ?? null;
                  return (
                    <div key={p.id} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-brand-mist">{p.name}</div>
                        <div className="text-2xs text-brand-sage">{p.code}</div>
                      </div>
                      <select className="input w-36 py-1.5 text-xs" value={cur ?? ""} onChange={(e) => toggle(p.id, (e.target.value || null) as Assign["role"] | null)}>
                        <option value="">不可访问</option>
                        <option value="member">项目用户</option>
                        <option value="project_admin">项目管理员</option>
                      </select>
                    </div>
                  );
                })}
              </div>
              <Alert>{b.error}</Alert>
              <Alert kind="success">{b.message}</Alert>
              <button className="btn-primary" disabled={b.pending} onClick={() => b.exec(() => setUserProjects(user.id, assign), () => router.refresh())}>保存项目归属</button>
            </>
          )}
        </section>

        <section className="space-y-3 border-t border-line pt-5">
          <div className="eyebrow">重置密码</div>
          <div className="flex gap-2">
            <input className="input font-mono" placeholder="新密码（至少 8 位）" value={pw} onChange={(e) => setPw(e.target.value)} />
            <button className="btn-secondary" onClick={() => setPw(genPassword())}>生成</button>
            <button className="btn-secondary" disabled={c.pending || pw.length < 8} onClick={() => c.exec(() => resetPassword(user.id, pw))}>
              <KeyRound size={14} />重置
            </button>
          </div>
          <Alert>{c.error}</Alert>
          <Alert kind="success">{c.message}</Alert>
        </section>
      </div>
    </Drawer>
  );
}
