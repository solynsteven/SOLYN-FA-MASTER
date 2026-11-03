"use client";

import Link from "next/link";
import { useActionState, useTransition, useState } from "react";
import { acceptAsCurrent, acceptWithSignup } from "../actions";
import { logoutAction } from "../../actions";
import { lightInput } from "../../AuthShell";

const btn = "w-full rounded-md bg-brand-green py-2.5 text-sm font-medium text-brand-paper transition hover:bg-brand-pine disabled:opacity-60";
const errBox = "rounded-md bg-[#C8765F]/10 px-3 py-2 text-xs text-[#9E4F3A]";

export function InviteForms({ token, mode, email, name, meEmail }: { token: string; mode: "accept" | "mismatch" | "login" | "signup"; email: string; name: string; meEmail: string | null }) {
  const [state, action, pending] = useActionState(acceptWithSignup.bind(null, token), undefined);
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  if (mode === "accept") {
    return (
      <div className="space-y-3">
        {err && <div className={errBox}>{err}</div>}
        <button className={btn} disabled={busy} onClick={() => start(async () => { const r = await acceptAsCurrent(token); if (r?.error) setErr(r.error); })}>{busy ? "处理中…" : "接受邀请并进入数据室"}</button>
      </div>
    );
  }
  if (mode === "mismatch") {
    return (
      <div className="space-y-3 text-sm text-brand-pine">
        <p>您当前以 <b>{meEmail}</b> 登录，而该邀请仅限 <b>{email}</b> 使用。</p>
        <form action={logoutAction}><button className={btn}>退出当前账号</button></form>
      </div>
    );
  }
  if (mode === "login") {
    return (
      <div className="space-y-3 text-sm text-brand-pine">
        <p>该邮箱已有 FA MASTER 账号，请登录后接受邀请。</p>
        <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className={`${btn} block text-center`}>登录</Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-brand-pine">姓名（用于 NDA 电子签名与水印）</label>
        <input name="name" required defaultValue={name} className={lightInput} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-brand-pine">设置密码（至少 10 位，含字母与数字）</label>
        <input name="password" type="password" autoComplete="new-password" required className={lightInput} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-brand-pine">确认密码</label>
        <input name="password2" type="password" autoComplete="new-password" required className={lightInput} />
      </div>
      {state?.error && <div className={errBox}>{state.error}</div>}
      <button disabled={pending} className={btn}>{pending ? "创建中…" : "创建账号并接受邀请"}</button>
    </form>
  );
}
