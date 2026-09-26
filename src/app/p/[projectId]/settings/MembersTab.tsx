"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Trash2 } from "lucide-react";
import { Alert, Badge, ConfirmButton, Modal, useAction } from "@/components/ui";
import { addMember, updateMemberRole, removeMember } from "./actions";
import { fmtDate } from "@/lib/format";
import { genPassword } from "@/app/admin/users/UsersClient";

type M = { userId: string; name: string; email: string; title: string; role: "project_admin" | "member"; isActive: boolean; joinedAt: string };

export function MembersTab({ projectId, members, meId }: { projectId: string; members: M[]; meId: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const a = useAction();
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-brand-sage">
          <b className="font-medium text-brand-mist">项目管理员</b>：可新增 / 编辑 / 删除任务、管理成员与字段；
          <b className="ml-2 font-medium text-brand-mist">项目用户</b>：可查看并使用本项目已启用的模块。全局管理员默认拥有全部项目权限，不在此列出。
        </p>
        <button className="btn-primary shrink-0" onClick={() => setAdding(true)}><UserPlus size={15} />添加成员</button>
      </div>
      <Alert>{a.error}</Alert>
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead><tr><th className="th">姓名</th><th className="th">邮箱</th><th className="th w-44">项目角色</th><th className="th w-24">账号</th><th className="th w-32">加入日期</th><th className="th w-16" /></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId} className="hover:bg-ink-850/60">
                <td className="td text-brand-paper">{m.name}{m.userId === meId && <span className="ml-1.5 text-2xs text-brand-sage">（我）</span>}{m.title && <div className="text-2xs text-brand-sage">{m.title}</div>}</td>
                <td className="td text-brand-sage">{m.email}</td>
                <td className="td">
                  <select
                    className="input py-1 text-xs"
                    value={m.role}
                    disabled={a.pending}
                    onChange={(e) => a.exec(() => updateMemberRole(projectId, m.userId, e.target.value as M["role"]), () => router.refresh())}
                  >
                    <option value="member">项目用户</option>
                    <option value="project_admin">项目管理员</option>
                  </select>
                </td>
                <td className="td">{m.isActive ? <Badge tone="mid">启用</Badge> : <Badge tone="danger">停用</Badge>}</td>
                <td className="td font-num text-xs text-brand-sage">{fmtDate(m.joinedAt)}</td>
                <td className="td text-right">
                  {m.userId !== meId && (
                    <ConfirmButton
                      className="btn-ghost btn-sm text-danger"
                      title="移出项目"
                      confirmText="移出"
                      body={<>确定将 <b className="text-brand-paper">{m.name}</b> 移出本项目？其账号仍保留，只是不再能访问本项目。</>}
                      onConfirm={() => a.exec(() => removeMember(projectId, m.userId), () => router.refresh())}
                    >
                      <Trash2 size={14} />
                    </ConfirmButton>
                  )}
                </td>
              </tr>
            ))}
            {members.length === 0 && <tr><td colSpan={6} className="td py-10 text-center text-brand-sage">尚未添加成员</td></tr>}
          </tbody>
        </table>
      </div>
      {adding && <AddMemberModal projectId={projectId} onClose={() => setAdding(false)} />}
    </>
  );
}

function AddMemberModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const router = useRouter();
  const a = useAction();
  const [f, setF] = useState({ email: "", role: "member" as M["role"], name: "", password: "" });
  const [needCreate, setNeedCreate] = useState(false);
  const submit = () =>
    a.exec(
      async () => {
        const r = await addMember(projectId, needCreate ? f : { email: f.email, role: f.role });
        if (!r.ok && r.error === "NEED_CREATE") {
          setNeedCreate(true);
          setF((x) => ({ ...x, password: x.password || genPassword() }));
          return { ok: false as const, error: "系统中没有该邮箱的账号，请补充姓名与初始密码以创建新账号" };
        }
        return r;
      },
      () => { onClose(); router.refresh(); },
    );
  return (
    <Modal
      open
      onClose={onClose}
      title="添加项目成员"
      footer={<><button className="btn-secondary" onClick={onClose}>取消</button><button className="btn-primary" disabled={a.pending} onClick={submit}>{needCreate ? "创建账号并添加" : "添加"}</button></>}
    >
      <div className="space-y-3">
        <div><label className="label">成员邮箱</label><input className="input" type="email" value={f.email} onChange={(e) => { setF({ ...f, email: e.target.value }); setNeedCreate(false); }} placeholder="已有账号直接添加；新邮箱将创建账号" /></div>
        <div>
          <label className="label">项目角色</label>
          <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as M["role"] })}>
            <option value="member">项目用户</option>
            <option value="project_admin">项目管理员</option>
          </select>
        </div>
        {needCreate && (
          <div className="grid grid-cols-2 gap-3 rounded-md border border-line bg-ink-950/50 p-3">
            <div><label className="label">姓名</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div><label className="label">初始密码</label><input className="input font-mono" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
            <p className="col-span-2 text-2xs text-brand-sage">请将邮箱与初始密码线下告知对方，对方登录后可在「账号设置」中修改。</p>
          </div>
        )}
        <Alert kind={needCreate && a.error?.startsWith("系统中没有") ? "info" : "error"}>{a.error}</Alert>
      </div>
    </Modal>
  );
}
