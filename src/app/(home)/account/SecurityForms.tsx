"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { KeyRound, ShieldCheck, LogOut, Smartphone } from "lucide-react";
import { Alert, Badge, useAction } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { startMfaSetup, confirmMfa, disableMfa, revokeMyOtherSessions } from "./actions";

type S = { id: string; ip: string | null; ua: string | null; mfa: boolean; createdAt: string; lastSeenAt: string; current: boolean };
type D = { id: string; ua: string | null; lastIp: string | null; createdAt: string; lastSeenAt: string };
const ua = (s: string | null) => {
  if (!s) return "未知设备";
  const os = /Windows/.test(s) ? "Windows" : /Mac OS X/.test(s) ? "macOS" : /iPhone|iPad/.test(s) ? "iOS" : /Android/.test(s) ? "Android" : /Linux/.test(s) ? "Linux" : "其他";
  const br = /Edg\//.test(s) ? "Edge" : /Chrome\//.test(s) ? "Chrome" : /Firefox\//.test(s) ? "Firefox" : /Safari\//.test(s) ? "Safari" : "浏览器";
  return `${br} · ${os}`;
};

export function SecurityForms({ mfaEnabled, mfaSince, sessions, devices, highlight, back }: { mfaEnabled: boolean; mfaSince: string | null; sessions: S[]; devices: D[]; highlight: boolean; back: string | null }) {
  const router = useRouter();
  const a = useAction();
  const b = useAction();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [off, setOff] = useState("");
  return (
    <div className="mt-5 grid max-w-4xl gap-5 md:grid-cols-2">
      <div className={`card space-y-4 p-5 ${highlight && !mfaEnabled ? "ring-1 ring-brand-mid" : ""}`}>
        <div className="flex items-center justify-between text-sm font-medium text-brand-paper">
          <span className="inline-flex items-center gap-2"><KeyRound size={15} />二次验证（MFA）</span>
          {mfaEnabled ? <Badge tone="mid">已开启</Badge> : <Badge tone="warn">未开启</Badge>}
        </div>
        <Alert>{a.error}</Alert>
        <Alert kind="success">{a.message}</Alert>
        {mfaEnabled ? (
          <>
            <p className="text-xs leading-relaxed text-brand-sage">登录时需输入验证器 App 中的 6 位动态码（也可改用邮箱验证码）。开启于 {fmtDateTime(mfaSince)}。</p>
            {back && <Link href={back} className="btn-primary w-full justify-center"><ShieldCheck size={14} />返回数据室</Link>}
            <div className="border-t border-line pt-4">
              <div className="mb-1.5 text-2xs text-brand-sage">关闭二次验证（输入当前动态码确认）</div>
              <div className="flex gap-2">
                <input className="input font-num tracking-widest" inputMode="numeric" maxLength={6} value={off} onChange={(e) => setOff(e.target.value)} placeholder="000000" />
                <button className="btn-secondary shrink-0" disabled={a.pending || off.length < 6} onClick={() => a.exec(() => disableMfa(off), () => { setOff(""); router.refresh(); })}>关闭</button>
              </div>
            </div>
          </>
        ) : setup ? (
          <>
            <p className="text-xs leading-relaxed text-brand-sage">1. 用 Google Authenticator / Microsoft Authenticator / 1Password 等扫描二维码；2. 输入 App 显示的 6 位动态码完成绑定。</p>
            <div className="flex items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qr} alt="MFA QR" width={150} height={150} className="rounded" />
              <div className="min-w-0 text-2xs text-brand-sage">无法扫码时手动输入密钥：<div className="mt-1 break-all font-num text-xs text-brand-mist">{setup.secret.replace(/(.{4})/g, "$1 ")}</div></div>
            </div>
            <div className="flex gap-2">
              <input className="input font-num tracking-widest" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" autoFocus />
              <button className="btn-primary shrink-0" disabled={a.pending || code.length < 6} onClick={() => a.exec(() => confirmMfa(code), () => { setSetup(null); setCode(""); router.refresh(); if (back) router.push(back); })}>验证并开启</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs leading-relaxed text-brand-sage">绑定验证器 App 后，登录需额外输入动态码。部分数据室要求开启二次验证才能进入。</p>
            <button className="btn-primary" disabled={a.pending} onClick={() => a.exec(() => startMfaSetup(), (r) => r.data && setSetup(r.data))}><Smartphone size={14} />绑定验证器 App</button>
          </>
        )}
      </div>

      <div className="card space-y-3 p-5">
        <div className="flex items-center justify-between text-sm font-medium text-brand-paper">
          <span>登录会话与设备</span>
          {sessions.length > 1 && <button className="btn-ghost btn-sm" disabled={b.pending} onClick={() => b.exec(() => revokeMyOtherSessions(), () => router.refresh())}><LogOut size={13} />退出其他设备</button>}
        </div>
        <Alert>{b.error}</Alert>
        <Alert kind="success">{b.message}</Alert>
        <div className="space-y-2">
          {sessions.map((s) => (
            <div key={s.id} className="rounded border border-line px-3 py-2 text-xs">
              <div className="flex items-center justify-between text-brand-mist">{ua(s.ua)}<span className="flex gap-1">{s.mfa && <Badge tone="mid">MFA</Badge>}{s.current && <Badge tone="outline">当前</Badge>}</span></div>
              <div className="mt-0.5 font-num text-2xs text-brand-sage">IP {s.ip ?? "—"} · 最近活动 {fmtDateTime(s.lastSeenAt)}</div>
            </div>
          ))}
        </div>
        <div className="pt-2 text-2xs text-brand-sage">已登录过的设备（{devices.length}）：在新设备登录时会向您的邮箱发送提醒。</div>
        <div className="space-y-1">
          {devices.map((d) => <div key={d.id} className="flex justify-between text-2xs text-brand-sage"><span className="text-brand-mist">{ua(d.ua)}</span><span className="font-num">{d.lastIp ?? "—"} · {fmtDateTime(d.lastSeenAt)}</span></div>)}
        </div>
      </div>
    </div>
  );
}
