"use client";

import { useActionState } from "react";
import { loginAction } from "../actions";
import { lightInput } from "../AuthShell";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="mb-1.5 block text-xs font-medium text-brand-pine">邮箱</label>
        <input name="email" type="email" autoComplete="email" required className={lightInput} placeholder="name@solynadvisory.com" />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-brand-pine">密码</label>
        <input name="password" type="password" autoComplete="current-password" required className={lightInput} />
      </div>
      {state?.error && <div className="rounded-md bg-[#C8765F]/10 px-3 py-2 text-xs text-[#9E4F3A]">{state.error}</div>}
      <button disabled={pending} className="w-full rounded-md bg-brand-green py-2.5 text-sm font-medium text-brand-paper transition hover:bg-brand-pine disabled:opacity-60">
        {pending ? "登录中…" : "登录"}
      </button>
      <p className="pt-2 text-center text-2xs text-brand-sage">忘记密码请联系全局管理员重置</p>
    </form>
  );
}
