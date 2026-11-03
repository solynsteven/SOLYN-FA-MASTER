"use client";

import { useActionState, useState, useTransition } from "react";
import { mfaAction, sendLoginEmailCode } from "../../actions";
import { lightInput } from "../../AuthShell";

export function MfaForm({ email, emailEnabled }: { email: string; emailEnabled: boolean }) {
  const [state, action, pending] = useActionState(mfaAction, undefined);
  const [via, setVia] = useState<"totp" | "email">("totp");
  const [sent, setSent] = useState<string | null>(null);
  const [sending, start] = useTransition();
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="via" value={via} />
      <div>
        <label className="mb-1.5 block text-xs font-medium text-brand-pine">{via === "totp" ? "验证器动态码" : `邮件验证码（已发送至 ${email}）`}</label>
        <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus required className={`${lightInput} text-center font-mono text-lg tracking-[0.5em]`} placeholder="000000" />
      </div>
      {(state?.error || sent) && <div className={`rounded-md px-3 py-2 text-xs ${state?.error ? "bg-[#C8765F]/10 text-[#9E4F3A]" : "bg-brand-mist/40 text-brand-pine"}`}>{state?.error ?? sent}</div>}
      <button disabled={pending} className="w-full rounded-md bg-brand-green py-2.5 text-sm font-medium text-brand-paper transition hover:bg-brand-pine disabled:opacity-60">{pending ? "验证中…" : "验证并登录"}</button>
      {emailEnabled && (
        <button
          type="button"
          disabled={sending}
          className="w-full text-center text-2xs text-brand-sage underline-offset-2 hover:underline"
          onClick={() => start(async () => {
            const r = await sendLoginEmailCode();
            if (r?.error) setSent(r.error);
            else { setVia("email"); setSent("邮件验证码已发送，10 分钟内有效"); }
          })}
        >
          {via === "email" ? "重新发送邮件验证码" : "无法使用验证器？改用邮件验证码"}
        </button>
      )}
      <p className="text-center text-2xs text-brand-sage"><a href="/login" className="hover:underline">返回登录</a></p>
    </form>
  );
}
