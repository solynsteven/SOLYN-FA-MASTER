"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, useAction } from "@/components/ui";
import { changePassword, updateProfile } from "./actions";

export function AccountForms({ name: n0, title: t0 }: { name: string; title: string }) {
  const router = useRouter();
  const [name, setName] = useState(n0);
  const [title, setTitle] = useState(t0);
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const a = useAction();
  const b = useAction();
  return (
    <div className="grid max-w-4xl gap-5 md:grid-cols-2">
      <form
        className="card space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          a.exec(() => updateProfile(name, title), () => router.refresh());
        }}
      >
        <div className="text-sm font-medium text-brand-paper">个人资料</div>
        <div><label className="label">姓名</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label">职位</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：投资总监" /></div>
        <Alert>{a.error}</Alert>
        <Alert kind="success">{a.message}</Alert>
        <button className="btn-primary" disabled={a.pending}>保存</button>
      </form>
      <form
        className="card space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (pw !== pw2) return b.setError("两次输入的新密码不一致");
          b.exec(() => changePassword(cur, pw), () => { setCur(""); setPw(""); setPw2(""); });
        }}
      >
        <div className="text-sm font-medium text-brand-paper">修改密码</div>
        <div><label className="label">当前密码</label><input type="password" className="input" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
        <div><label className="label">新密码（至少 8 位）</label><input type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <div><label className="label">确认新密码</label><input type="password" className="input" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
        <Alert>{b.error}</Alert>
        <Alert kind="success">{b.message}</Alert>
        <button className="btn-primary" disabled={b.pending}>更新密码</button>
      </form>
    </div>
  );
}
