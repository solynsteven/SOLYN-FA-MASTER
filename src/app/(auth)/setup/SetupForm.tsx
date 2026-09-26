"use client";

import { useActionState } from "react";
import { setupAction } from "../actions";
import { lightInput } from "../AuthShell";

export function SetupForm() {
  const [state, action, pending] = useActionState(setupAction, undefined);
  const f = (name: string, label: string, type = "text", auto?: string) => (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-brand-pine">{label}</label>
      <input name={name} type={type} required autoComplete={auto} className={lightInput} />
    </div>
  );
  return (
    <form action={action} className="space-y-4">
      {f("name", "姓名", "text", "name")}
      {f("email", "邮箱", "email", "email")}
      {f("password", "密码（至少 8 位）", "password", "new-password")}
      {f("confirm", "确认密码", "password", "new-password")}
      {state?.error && <div className="rounded-md bg-[#C8765F]/10 px-3 py-2 text-xs text-[#9E4F3A]">{state.error}</div>}
      <button disabled={pending} className="w-full rounded-md bg-brand-green py-2.5 text-sm font-medium text-brand-paper transition hover:bg-brand-pine disabled:opacity-60">
        {pending ? "创建中…" : "创建全局管理员并进入"}
      </button>
    </form>
  );
}
