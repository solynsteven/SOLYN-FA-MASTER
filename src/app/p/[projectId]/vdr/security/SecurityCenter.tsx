"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users, UserPlus, FileSignature, Droplets, LockKeyhole, ScrollText, Plus, Pencil, Trash2, LogOut, Copy, RotateCw, Ban, KeyRound, Undo2, FileDown, ShieldCheck, Mail,
} from "lucide-react";
import { Alert, Badge, ConfirmButton, Modal, Toggle, useAction, cn } from "@/components/ui";
import { CapsEditor } from "@/components/vdr/dialogs";
import { wmBackground } from "@/components/vdr/Viewer";
import { levelMeta, levelOf, VDR_ACTION_LABEL, DOWNLOAD_MODES } from "@/lib/vdr/constants";
import { fmtDateTime } from "@/lib/format";
import type { VdrCap, VdrGroupPolicy, VdrDownloadMode, WatermarkField, IrmPolicy } from "@/db/schema";
import type { VdrSettingsView } from "@/lib/vdr/groups";
import { NDA_TEMPLATES, type NdaLang } from "@/lib/vdr/nda-templates";
import {
  saveGroup, deleteGroup, updateMemberAccess, revokeSessions, inviteMember, resendInvitation, revokeInvitation, saveNda, saveSecuritySettings,
  revokeIrm, revokeIrmOfUser, updateIrmPolicy, restoreIrm, irmPassword, type GroupInput,
} from "./actions";

type Kind = GroupInput["kind"];
type G = { id: string; code: string; name: string; description: string; kind: Kind; caps: VdrCap[]; policy: VdrGroupPolicy; members: number };
type Sess = { id: string; ip: string | null; ua: string | null; mfa: boolean; lastSeenAt: string; createdAt: string };
type M = { userId: string; name: string; email: string; isActive: boolean; mfa: boolean; role: string; group: string | null; organization: string | null; accessExpiresAt: string | null; lastLoginAt: string | null; sessions: Sess[]; ndaSigned: boolean };
type Inv = { id: string; email: string; name: string | null; group: string | null; organization: string | null; status: string; expiresAt: string; accessExpiresAt: string | null; createdAt: string; acceptedAt: string | null; shareFile: string | null };
type Sig = { id: string; userId: string; name: string; email: string; version: number; signedName: string; signedAt: string; ip: string | null; hash: string };
type Iss = { id: string; kind: "package" | "pdf" | "office" | "watermark"; fileName: string; file: string; userId: string; user: string; email: string; policy: IrmPolicy; printsUsed: number; openCount: number; lastOpenedAt: string | null; lastIp: string | null; revokedAt: string | null; revokeReason: string | null; createdAt: string; hasPassword: boolean; expired: boolean };
type Ev = { id: string; action: string; user: string; file: string | null; detail: Record<string, unknown>; ip: string | null; at: string };

const KIND_LABEL: Record<Kind, string> = { internal: "内部", seller: "卖方", buyer: "买方", advisor: "顾问", custom: "自定义" };
const TABS = [
  { k: "groups", l: "权限组与准入", icon: ShieldCheck },
  { k: "members", l: "成员与邀请", icon: Users },
  { k: "nda", l: "NDA", icon: FileSignature },
  { k: "watermark", l: "水印与下载", icon: Droplets },
  { k: "irm", l: "受控副本 IRM", icon: LockKeyhole },
  { k: "log", l: "安全日志", icon: ScrollText },
] as const;
const toLocal = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (s: string) => (s ? new Date(s).toISOString() : null);
const uaShort = (ua: string | null) => {
  if (!ua) return "未知设备";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Linux/.test(ua) ? "Linux" : "其他";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "浏览器";
  return `${br} · ${os}`;
};
const WD = ["一", "二", "三", "四", "五", "六", "日"];

export function SecurityCenter(p: {
  projectId: string; meId: string; meName: string; meEmail: string; initialTab: string; mailEnabled: boolean; myIp: string;
  groups: G[]; members: M[]; invites: Inv[]; settings: VdrSettingsView; wmFieldLabels: Record<WatermarkField, string>; wmSample: string;
  signatures: Sig[]; issues: Iss[]; events: Ev[];
}) {
  const [tab, setTab] = useState(TABS.some((t) => t.k === p.initialTab) ? p.initialTab : "groups");
  const pick = (k: string) => {
    setTab(k);
    window.history.replaceState(null, "", `?tab=${k}`);
  };
  return (
    <>
      <div className="mb-5 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button key={t.k} onClick={() => pick(t.k)} className={cn("-mb-px inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2 text-sm transition", tab === t.k ? "border-brand-mid text-brand-paper" : "border-transparent text-brand-sage hover:text-brand-mist")}>
            <t.icon size={14} />{t.l}
          </button>
        ))}
      </div>
      {!p.mailEnabled && (tab === "members" || tab === "groups") && (
        <div className="mb-4"><Alert kind="info">尚未配置邮件服务（RESEND_API_KEY / MAIL_FROM）：邀请邮件、邮箱验证码与陌生设备告警不会发送；邀请链接可在生成后手动复制给对方。</Alert></div>
      )}
      {tab === "groups" && <GroupsTab {...p} />}
      {tab === "members" && <MembersTab {...p} />}
      {tab === "nda" && <NdaTab {...p} />}
      {tab === "watermark" && <WatermarkTab {...p} />}
      {tab === "irm" && <IrmTab {...p} />}
      {tab === "log" && <LogTab events={p.events} />}
    </>
  );
}

/* ================================ 权限组 ================================ */

function policySummary(pl: VdrGroupPolicy) {
  const out: string[] = [];
  if (pl.requireMfa) out.push("MFA");
  if (pl.ipAllowlist?.length) out.push(`IP×${pl.ipAllowlist.length}`);
  if (pl.emailDomains?.length) out.push(`@${pl.emailDomains.join(" @")}`);
  if (pl.window) out.push(`${pl.window.days?.length ? "周" + pl.window.days.map((d) => WD[d - 1]).join("") : "每天"} ${pl.window.start}–${pl.window.end}`);
  if (pl.accessFrom) out.push(`自 ${fmtDateTime(pl.accessFrom)}`);
  if (pl.accessUntil) out.push(`至 ${fmtDateTime(pl.accessUntil)}`);
  if (pl.maxSessions) out.push(`并发≤${pl.maxSessions}`);
  return out;
}

function GroupsTab({ projectId, groups }: { projectId: string; groups: G[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<G | "new" | null>(null);
  const a = useAction();
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="text-xs leading-relaxed text-brand-sage">每个成员归属一个权限组。组的「默认权限」作用于没有单独设置规则的目录 / 文件；准入策略在进入数据室时逐项检查（项目管理员不受限）。</p>
        <button className="btn-primary shrink-0" onClick={() => setEdit("new")}><Plus size={14} />新建权限组</button>
      </div>
      <Alert>{a.error}</Alert>
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead><tr><th className="th w-20">代码</th><th className="th">名称</th><th className="th w-16">类型</th><th className="th w-40">默认权限</th><th className="th">准入风控</th><th className="th w-14 text-right">成员</th><th className="th w-20" /></tr></thead>
          <tbody>
            {groups.map((g) => {
              const lv = levelOf(g.caps);
              const ps = policySummary(g.policy);
              return (
                <tr key={g.id} className="hover:bg-ink-850/60">
                  <td className="td font-num font-medium text-brand-paper">{g.code}</td>
                  <td className="td text-brand-paper">{g.name}{g.description && <div className="text-2xs text-brand-sage">{g.description}</div>}</td>
                  <td className="td text-xs text-brand-sage">{KIND_LABEL[g.kind]}</td>
                  <td className="td text-xs"><span className="font-num font-semibold" style={{ color: levelMeta(lv).color }}>{levelMeta(lv).short}</span> <span style={{ color: levelMeta(lv).color }}>{levelMeta(lv).label}</span></td>
                  <td className="td">{ps.length ? <div className="flex flex-wrap gap-1">{ps.map((x) => <Badge key={x} tone="outline">{x}</Badge>)}</div> : <span className="text-2xs text-brand-sage">—</span>}</td>
                  <td className="td text-right font-num text-xs">{g.members}</td>
                  <td className="td text-right">
                    <button className="btn-ghost btn-sm" title="编辑" onClick={() => setEdit(g)}><Pencil size={13} /></button>
                    {g.code !== "ADM" && (
                      <ConfirmButton className="btn-ghost btn-sm text-danger" title="删除权限组" confirmText="删除" body={<>删除「{g.name}」及其所有目录 / 文件权限规则？组内仍有成员时不能删除。</>}
                        onConfirm={() => a.exec(() => deleteGroup(projectId, g.id), () => router.refresh())}><Trash2 size={13} /></ConfirmButton>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {edit && <GroupDialog projectId={projectId} group={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function GroupDialog({ projectId, group, onClose }: { projectId: string; group: G | null; onClose: () => void }) {
  const router = useRouter();
  const a = useAction();
  const pl = group?.policy ?? {};
  const [f, setF] = useState({
    code: group?.code ?? "", name: group?.name ?? "", description: group?.description ?? "", kind: (group?.kind ?? "buyer") as Kind, caps: group?.caps ?? [],
    requireMfa: !!pl.requireMfa, ip: (pl.ipAllowlist ?? []).join("\n"), domains: (pl.emailDomains ?? []).join(", "),
    winOn: !!pl.window, days: pl.window?.days ?? [1, 2, 3, 4, 5], start: pl.window?.start ?? "09:00", end: pl.window?.end ?? "19:00", tz: pl.window?.tz ?? "Asia/Tokyo",
    from: toLocal(pl.accessFrom), until: toLocal(pl.accessUntil), maxSessions: pl.maxSessions ?? 0,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = () => a.exec(() => saveGroup(projectId, {
    id: group?.id, code: f.code, name: f.name, description: f.description, kind: f.kind, caps: f.caps,
    policy: {
      requireMfa: f.requireMfa, ipAllowlist: f.ip.split(/[\s,;]+/).filter(Boolean), emailDomains: f.domains.split(/[\s,;]+/).filter(Boolean),
      window: f.winOn ? { days: f.days, start: f.start, end: f.end, tz: f.tz } : null, accessFrom: fromLocal(f.from), accessUntil: fromLocal(f.until), maxSessions: f.maxSessions || null,
    },
  }), () => { router.refresh(); onClose(); });
  return (
    <Modal open onClose={onClose} title={group ? `编辑权限组 · ${group.code}` : "新建权限组"} width="max-w-2xl"
      footer={<><button className="btn-secondary" onClick={onClose}>取消</button><button className="btn-primary" disabled={a.pending} onClick={save}>{a.pending ? "保存中…" : "保存"}</button></>}>
      <Alert>{a.error}</Alert>
      <div className="grid grid-cols-[110px_1fr_120px] gap-3">
        <label className="text-xs text-brand-sage">代码<input className="input mt-1 font-num uppercase" value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} disabled={group?.code === "ADM"} placeholder="BID3" /></label>
        <label className="text-xs text-brand-sage">名称<input className="input mt-1" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="竞标买方组 3" /></label>
        <label className="text-xs text-brand-sage">类型
          <select className="input mt-1" value={f.kind} onChange={(e) => set("kind", e.target.value as Kind)}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
      </div>
      <label className="mt-3 block text-xs text-brand-sage">说明<input className="input mt-1" value={f.description} onChange={(e) => set("description", e.target.value)} /></label>
      <div className="mt-4 text-xs text-brand-sage">默认权限（未单独设置的目录 / 文件）</div>
      <div className="mt-1.5"><CapsEditor value={f.caps} inherit={[]} allowInherit={false} onChange={(v) => set("caps", v ?? [])} /></div>

      <div className="mt-5 border-t border-line pt-4 text-xs font-medium text-brand-mist">准入风控</div>
      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3">
        <div className="col-span-2 flex items-center gap-2 text-sm text-brand-mist"><Toggle checked={f.requireMfa} onChange={(v) => set("requireMfa", v)} />强制二次验证（验证器 App；邮箱验证码作为备用）</div>
        <label className="text-xs text-brand-sage">IP 白名单（每行一条，支持 CIDR，留空不限制）
          <textarea className="input mt-1 h-20 font-num text-xs" value={f.ip} onChange={(e) => set("ip", e.target.value)} placeholder={"203.0.113.0/24\n2001:db8::/32"} />
        </label>
        <label className="text-xs text-brand-sage">允许的邮箱域名（逗号分隔，留空不限制）
          <textarea className="input mt-1 h-20 text-xs" value={f.domains} onChange={(e) => set("domains", e.target.value)} placeholder="buyer-a.co.jp, law-firm.jp" />
        </label>
        <label className="text-xs text-brand-sage">访问开始<input type="datetime-local" className="input mt-1" value={f.from} onChange={(e) => set("from", e.target.value)} /></label>
        <label className="text-xs text-brand-sage">访问到期（到点自动无法进入）<input type="datetime-local" className="input mt-1" value={f.until} onChange={(e) => set("until", e.target.value)} /></label>
        <div className="col-span-2">
          <div className="flex items-center gap-2 text-sm text-brand-mist"><Toggle checked={f.winOn} onChange={(v) => set("winOn", v)} />定时访问窗口</div>
          {f.winOn && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-brand-sage">
              {WD.map((d, i) => (
                <button key={d} type="button" onClick={() => set("days", f.days.includes(i + 1) ? f.days.filter((x) => x !== i + 1) : [...f.days, i + 1].sort())}
                  className={cn("h-7 w-7 rounded border", f.days.includes(i + 1) ? "border-brand-mid bg-brand-green/40 text-brand-paper" : "border-line")}>{d}</button>
              ))}
              <input type="time" className="input w-28" value={f.start} onChange={(e) => set("start", e.target.value)} />–
              <input type="time" className="input w-28" value={f.end} onChange={(e) => set("end", e.target.value)} />
              <select className="input w-auto" value={f.tz} onChange={(e) => set("tz", e.target.value)}>
                {["Asia/Tokyo", "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"].map((z) => <option key={z}>{z}</option>)}
              </select>
            </div>
          )}
        </div>
        <label className="text-xs text-brand-sage">单账号并发会话上限（0 = 不限；超出时最早的会话被下线）
          <input type="number" min={0} max={20} className="input mt-1 w-28" value={f.maxSessions} onChange={(e) => set("maxSessions", Number(e.target.value))} />
        </label>
      </div>
    </Modal>
  );
}

/* ================================ 成员与邀请 ================================ */

function MembersTab({ projectId, meId, groups, members, invites }: { projectId: string; meId: string; groups: G[]; members: M[]; invites: Inv[] }) {
  const router = useRouter();
  const a = useAction();
  const [inviting, setInviting] = useState(false);
  const [sess, setSess] = useState<M | null>(null);
  const [link, setLink] = useState<{ link: string; mailed: boolean; mailError: string | null } | null>(null);
  const done = (r: { data?: { link: string; mailed: boolean; mailError: string | null } }) => { if (r.data) setLink(r.data); router.refresh(); };
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="text-xs leading-relaxed text-brand-sage">账号采用邀请制，不提供公开匿名链接。受邀人通过邮件中的一次性链接设置账号后加入本项目；邀请链接仅限受邀邮箱使用。</p>
        <button className="btn-primary shrink-0" onClick={() => setInviting(true)}><UserPlus size={14} />邀请成员</button>
      </div>
      <Alert>{a.error}</Alert>
      {link && <LinkBox {...link} onClose={() => setLink(null)} />}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead><tr><th className="th">成员</th><th className="th w-44">权限组</th><th className="th w-40">所属机构</th><th className="th w-48">访问到期</th><th className="th w-16">MFA</th><th className="th w-16">NDA</th><th className="th w-24">在线会话</th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId} className="hover:bg-ink-850/60">
                <td className="td"><div className="text-brand-paper">{m.name}{m.role === "project_admin" && <Badge tone="mid" className="ml-1.5">管理员</Badge>}{!m.isActive && <Badge tone="danger" className="ml-1.5">停用</Badge>}</div><div className="text-2xs text-brand-sage">{m.email}</div></td>
                <td className="td">
                  <select className="input py-1 text-xs" value={m.group ?? ""} disabled={a.pending}
                    onChange={(e) => a.exec(() => updateMemberAccess(projectId, m.userId, { group: e.target.value || null, organization: m.organization, accessExpiresAt: m.accessExpiresAt }), () => router.refresh())}>
                    <option value="">未分组</option>
                    {groups.map((g) => <option key={g.code} value={g.code}>{g.code} · {g.name}</option>)}
                  </select>
                </td>
                <td className="td"><input className="input py-1 text-xs" defaultValue={m.organization ?? ""} onBlur={(e) => e.target.value !== (m.organization ?? "") && a.exec(() => updateMemberAccess(projectId, m.userId, { group: m.group, organization: e.target.value, accessExpiresAt: m.accessExpiresAt }), () => router.refresh())} /></td>
                <td className="td">
                  <input type="datetime-local" className={cn("input py-1 text-xs", m.accessExpiresAt && new Date(m.accessExpiresAt) < new Date() && "border-danger/60 text-danger")} defaultValue={toLocal(m.accessExpiresAt)}
                    onBlur={(e) => fromLocal(e.target.value) !== m.accessExpiresAt && a.exec(() => updateMemberAccess(projectId, m.userId, { group: m.group, organization: m.organization, accessExpiresAt: fromLocal(e.target.value) }), () => router.refresh())} />
                </td>
                <td className="td">{m.mfa ? <Badge tone="mid">已开启</Badge> : <span className="text-2xs text-brand-sage">未开启</span>}</td>
                <td className="td">{m.ndaSigned ? <Badge tone="mid">已签</Badge> : <span className="text-2xs text-brand-sage">未签</span>}</td>
                <td className="td"><button className="btn-ghost btn-sm" onClick={() => setSess(m)} disabled={!m.sessions.length}>{m.sessions.length} 个</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mb-2 mt-8 text-sm font-medium text-brand-paper">邀请记录</div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead><tr><th className="th">受邀人</th><th className="th w-28">权限组</th><th className="th w-40">机构 / 分享文件</th><th className="th w-36">链接有效至</th><th className="th w-36">访问到期</th><th className="th w-20">状态</th><th className="th w-24" /></tr></thead>
          <tbody>
            {invites.length === 0 && <tr><td className="td text-center text-xs text-brand-sage" colSpan={7}>暂无邀请</td></tr>}
            {invites.map((v) => (
              <tr key={v.id} className="hover:bg-ink-850/60">
                <td className="td"><div className="text-brand-paper">{v.name || v.email}</div>{v.name && <div className="text-2xs text-brand-sage">{v.email}</div>}</td>
                <td className="td font-num text-xs">{v.group ?? "—"}</td>
                <td className="td text-xs text-brand-sage">{v.shareFile ? <>分享：<span className="text-brand-mist">{v.shareFile}</span></> : v.organization ?? "—"}</td>
                <td className="td font-num text-xs text-brand-sage">{fmtDateTime(v.expiresAt)}</td>
                <td className="td font-num text-xs text-brand-sage">{v.accessExpiresAt ? fmtDateTime(v.accessExpiresAt) : "—"}</td>
                <td className="td">{{ pending: <Badge tone="warn">待接受</Badge>, accepted: <Badge tone="mid">已接受</Badge>, revoked: <Badge>已作废</Badge>, expired: <Badge tone="danger">已过期</Badge> }[v.status] ?? v.status}</td>
                <td className="td text-right">
                  {v.status !== "accepted" && <button className="btn-ghost btn-sm" title="重新发送（生成新链接）" onClick={() => a.exec(() => resendInvitation(projectId, v.id), done)}><RotateCw size={13} /></button>}
                  {v.status === "pending" && <button className="btn-ghost btn-sm text-danger" title="作废" onClick={() => a.exec(() => revokeInvitation(projectId, v.id), () => router.refresh())}><Ban size={13} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {inviting && <InviteDialog projectId={projectId} groups={groups} onClose={() => setInviting(false)} onDone={(r) => { setLink(r); setInviting(false); router.refresh(); }} />}
      {sess && (
        <Modal open onClose={() => setSess(null)} title={`在线会话 · ${sess.name}`} width="max-w-xl"
          footer={sess.userId !== meId ? (
            <button className="btn border border-danger/50 bg-danger/15 text-danger hover:bg-danger/25" disabled={a.pending} onClick={() => a.exec(() => revokeSessions(projectId, sess.userId), () => { setSess(null); router.refresh(); })}>
              <LogOut size={14} />强制下线全部会话
            </button>
          ) : undefined}>
          <div className="space-y-2">
            {sess.sessions.map((s) => (
              <div key={s.id} className="rounded border border-line px-3 py-2 text-xs">
                <div className="flex justify-between text-brand-mist"><span>{uaShort(s.ua)}</span>{s.mfa && <Badge tone="mid">MFA</Badge>}</div>
                <div className="mt-1 font-num text-2xs text-brand-sage">IP {s.ip ?? "—"} · 登录 {fmtDateTime(s.createdAt)} · 最近活动 {fmtDateTime(s.lastSeenAt)}</div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

function LinkBox({ link, mailed, mailError, onClose }: { link: string; mailed: boolean; mailError: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="card mb-4 border-brand-mid/50 px-4 py-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-brand-mist">{mailed ? <><Mail size={12} className="mr-1 inline" />邀请邮件已发送。</> : <>邀请已生成{mailError ? `（邮件未发送：${mailError}）` : "（未配置邮件服务）"}，请将以下链接安全地发送给受邀人：</>}</span>
        <button className="text-brand-sage hover:text-brand-paper" onClick={onClose}>关闭</button>
      </div>
      <div className="mt-2 flex gap-2">
        <input className="input flex-1 font-num text-xs" readOnly value={link} onFocus={(e) => e.target.select()} />
        <button className="btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(link); setCopied(true); }}><Copy size={13} />{copied ? "已复制" : "复制"}</button>
      </div>
      <div className="mt-1.5 text-2xs text-brand-sage">链接只显示这一次；如遗失可「重新发送」生成新链接（旧链接随即失效）。</div>
    </div>
  );
}

function InviteDialog({ projectId, groups, onClose, onDone }: { projectId: string; groups: G[]; onClose: () => void; onDone: (r: { link: string; mailed: boolean; mailError: string | null }) => void }) {
  const a = useAction();
  const [f, setF] = useState({ email: "", name: "", group: groups.find((g) => g.kind === "buyer")?.code ?? groups[0]?.code ?? "", organization: "", accessExpiresAt: "", linkDays: 7, note: "" });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const g = groups.find((x) => x.code === f.group);
  return (
    <Modal open onClose={onClose} title="邀请成员加入数据室"
      footer={<><button className="btn-secondary" onClick={onClose}>取消</button><button className="btn-primary" disabled={a.pending || !f.email} onClick={() => a.exec(() => inviteMember(projectId, { ...f, accessExpiresAt: fromLocal(f.accessExpiresAt) }), (r) => r.data && onDone(r.data))}>{a.pending ? "发送中…" : "发送邀请"}</button></>}>
      <Alert>{a.error}</Alert>
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 text-xs text-brand-sage">邮箱<input className="input mt-1" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="name@buyer.co.jp" /></label>
        <label className="text-xs text-brand-sage">姓名<input className="input mt-1" value={f.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label className="text-xs text-brand-sage">所属机构<input className="input mt-1" value={f.organization} onChange={(e) => set("organization", e.target.value)} placeholder="买家A公司" /></label>
        <label className="text-xs text-brand-sage">权限组
          <select className="input mt-1" value={f.group} onChange={(e) => set("group", e.target.value)}>{groups.map((x) => <option key={x.code} value={x.code}>{x.code} · {x.name}</option>)}</select>
        </label>
        <label className="text-xs text-brand-sage">邀请链接有效天数<input type="number" min={1} max={30} className="input mt-1" value={f.linkDays} onChange={(e) => set("linkDays", Number(e.target.value))} /></label>
        <label className="col-span-2 text-xs text-brand-sage">访问到期（可选，到点自动失效）<input type="datetime-local" className="input mt-1" value={f.accessExpiresAt} onChange={(e) => set("accessExpiresAt", e.target.value)} /></label>
      </div>
      {g?.policy.emailDomains?.length ? <p className="mt-2 text-2xs text-warn">该组仅允许：{g.policy.emailDomains.map((d) => "@" + d).join("、")}</p> : null}
    </Modal>
  );
}

/* ================================ NDA ================================ */

const TAGS = ["用户名", "邮箱", "机构", "项目名", "项目代号", "数据室ID", "日期"];

function NdaTab({ projectId, settings, signatures, members }: { projectId: string; settings: VdrSettingsView; signatures: Sig[]; members: M[] }) {
  const router = useRouter();
  const a = useAction();
  const [req, setReq] = useState(settings.ndaRequired);
  const [title, setTitle] = useState(settings.ndaTitle);
  const [tpl, setTpl] = useState(settings.ndaTemplate);
  const [bump, setBump] = useState(false);
  const [ta, setTa] = useState<HTMLTextAreaElement | null>(null);
  const insert = (t: string) => {
    const tag = `{{${t}}}`;
    if (!ta) return setTpl((x) => x + tag);
    const s = ta.selectionStart, e = ta.selectionEnd;
    setTpl((x) => x.slice(0, s) + tag + x.slice(e));
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + tag.length, s + tag.length); });
  };
  const external = members.filter((m) => m.role !== "project_admin");
  const unsigned = external.filter((m) => !m.ndaSigned);
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
      <div>
        <Alert>{a.error}</Alert>
        {a.message && <Alert kind="success">{a.message}</Alert>}
        <div className="card px-5 py-4">
          <div className="flex items-center gap-2 text-sm text-brand-mist"><Toggle checked={req} onChange={setReq} />进入数据室前必须在线签署 NDA（项目管理员除外）<span className="ml-auto font-num text-2xs text-brand-sage">当前版本 v{settings.ndaVersion}</span></div>
          <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-brand-sage">载入标准模板：
            {(Object.keys(NDA_TEMPLATES) as NdaLang[]).map((k) => (
              <ConfirmButton key={k} className="rounded border border-line px-2 py-0.5 text-2xs hover:border-brand-sage hover:text-brand-paper" title={`载入${NDA_TEMPLATES[k].label}模板`} confirmText="载入"
                body={<>用 Solyn 标准保密协议（{NDA_TEMPLATES[k].label}）替换当前编辑框中的标题和正文？载入后仍需点「保存 NDA 设置」才会生效。</>}
                onConfirm={() => { setTitle(NDA_TEMPLATES[k].title); setTpl(NDA_TEMPLATES[k].body); }}>
                {NDA_TEMPLATES[k].label}
              </ConfirmButton>
            ))}
          </div>
          <label className="mt-3 block text-xs text-brand-sage">协议标题<input className="input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <div className="mt-4 flex flex-wrap items-center gap-1 text-xs text-brand-sage">插入动态标签：
            {TAGS.map((t) => <button key={t} type="button" className="rounded border border-line px-1.5 py-0.5 text-2xs hover:border-brand-sage hover:text-brand-paper" onClick={() => insert(t)}>{`{{${t}}}`}</button>)}
          </div>
          <textarea ref={setTa} className="input mt-2 h-[420px] text-[13px] leading-6" value={tpl} onChange={(e) => setTpl(e.target.value)} />
          <label className="mt-3 flex items-center gap-2 text-xs text-brand-mist"><input type="checkbox" checked={bump} onChange={(e) => setBump(e.target.checked)} />发布为新版本（要求所有成员重新签署）</label>
          <p className="mt-1 text-2xs text-brand-sage">已开启签署时修改标题或正文，会自动发布新版本。</p>
          <div className="mt-4 flex justify-end">
            <button className="btn-primary" disabled={a.pending} onClick={() => a.exec(() => saveNda(projectId, { required: req, title, template: tpl, bump }), () => { setBump(false); router.refresh(); })}>{a.pending ? "保存中…" : "保存 NDA 设置"}</button>
          </div>
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between text-sm font-medium text-brand-paper">签署记录<span className="text-2xs font-normal text-brand-sage">v{settings.ndaVersion} 未签 {unsigned.length} / {external.length}</span></div>
        {unsigned.length > 0 && req && <div className="mb-2 text-2xs text-warn">未签署：{unsigned.map((m) => m.name).join("、")}</div>}
        <div className="card max-h-[640px] divide-y divide-line overflow-y-auto">
          {signatures.length === 0 && <div className="px-4 py-8 text-center text-xs text-brand-sage">暂无签署记录</div>}
          {signatures.map((s) => (
            <div key={s.id} className="px-4 py-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-brand-paper">{s.name} <span className="text-brand-sage">v{s.version}</span></span>
                <a className="text-brand-sage hover:text-brand-paper" href={`/p/${projectId}/vdr/nda/certificate?sig=${s.id}`} title="下载存证 PDF"><FileDown size={13} /></a>
              </div>
              <div className="mt-0.5 font-num text-2xs text-brand-sage">{fmtDateTime(s.signedAt)} · IP {s.ip ?? "—"} · {s.hash.slice(0, 12)}…</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================ 水印与下载 ================================ */

function WatermarkTab({ projectId, settings, wmFieldLabels, myIp, members, meId, meName, meEmail }: { projectId: string; settings: VdrSettingsView; wmFieldLabels: Record<WatermarkField, string>; myIp: string; members: M[]; meId: string; meName: string; meEmail: string }) {
  const router = useRouter();
  const a = useAction();
  const [w, setW] = useState(settings.watermark);
  const [d, setD] = useState(settings.download);
  const [mfa, setMfa] = useState(settings.requireMfa);
  const me = members.find((m) => m.userId === meId);
  const sample = useMemo(() => {
    const v: Record<WatermarkField, string> = {
      name: me?.name ?? meName, email: me?.email ?? meEmail, org: me?.organization ?? "Solyn Advisory", time: `${new Date().toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 16)} JST`,
      ip: `IP ${myIp || "203.0.113.8"}`, room: "VDR-XXX-1A2B3C", project: "项目名称", confidential: "商业机密",
    };
    return [...w.fields.map((f) => v[f]), w.customText.trim()].filter(Boolean).join(" · ");
  }, [w, me, myIp, meName, meEmail]);
  const all = Object.keys(wmFieldLabels) as WatermarkField[];
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div className="space-y-5">
        <Alert>{a.error}</Alert>
        {a.message && <Alert kind="success">{a.message}</Alert>}
        <div className="card px-5 py-4">
          <div className="text-sm font-medium text-brand-paper">动态水印</div>
          <p className="mt-1 text-2xs leading-relaxed text-brand-sage">用户级实时水印，不写入源文件：预览时由服务器逐页烧入图片并叠加屏幕层水印；下载时为该用户实时生成专属副本（斜向满铺，附追踪编号）。</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {all.map((f) => (
              <button key={f} type="button" onClick={() => setW({ ...w, fields: w.fields.includes(f) ? w.fields.filter((x) => x !== f) : [...w.fields, f] })}
                className={cn("rounded-full border px-2.5 py-0.5 text-xs", w.fields.includes(f) ? "border-brand-mid bg-brand-green/40 text-brand-paper" : "border-line text-brand-sage")}>
                {w.fields.includes(f) ? "✓ " : ""}{wmFieldLabels[f]}
              </button>
            ))}
          </div>
          <label className="mt-3 block text-xs text-brand-sage">附加文字<input className="input mt-1" maxLength={60} value={w.customText} onChange={(e) => setW({ ...w, customText: e.target.value })} placeholder="如 Strictly Confidential" /></label>
          <div className="mt-3 grid grid-cols-3 gap-4 text-xs text-brand-sage">
            <label>不透明度 {Math.round(w.opacity * 100)}%<input type="range" min={0.05} max={0.5} step={0.01} className="mt-1 w-full" value={w.opacity} onChange={(e) => setW({ ...w, opacity: Number(e.target.value) })} /></label>
            <label>字号 {w.size}px<input type="range" min={10} max={40} step={1} className="mt-1 w-full" value={w.size} onChange={(e) => setW({ ...w, size: Number(e.target.value) })} /></label>
            <label>密度 ×{w.density}<input type="range" min={0.5} max={3} step={0.25} className="mt-1 w-full" value={w.density} onChange={(e) => setW({ ...w, density: Number(e.target.value) })} /></label>
          </div>
        </div>
        <div className="card px-5 py-4">
          <div className="text-sm font-medium text-brand-paper">默认下载方式</div>
          <p className="mt-1 text-2xs text-brand-sage">适用于未单独设置文档安全策略的目录 / 文件；用户还需具备「下载」权限开关。</p>
          <div className="mt-3 space-y-2">
            {DOWNLOAD_MODES.map((m) => (
              <label key={m.key} className="flex items-start gap-2 text-xs text-brand-mist">
                <input type="checkbox" className="mt-0.5" checked={d.modes.includes(m.key)} onChange={(e) => setD({ ...d, modes: e.target.checked ? [...d.modes, m.key] : d.modes.filter((x) => x !== m.key) })} />
                <span><b className="font-medium">{m.label}</b><span className="ml-1.5 text-brand-sage">{m.desc}</span></span>
              </label>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 text-xs text-brand-sage">
            <label>IRM 默认有效期（天）<input type="number" min={1} max={365} className="input mt-1" value={d.irmExpiryDays} onChange={(e) => setD({ ...d, irmExpiryDays: Number(e.target.value) })} /></label>
            <label>IRM 默认打印次数（0 = 禁止）<input type="number" min={0} max={99} className="input mt-1" value={d.irmPrintLimit} onChange={(e) => setD({ ...d, irmPrintLimit: Number(e.target.value) })} /></label>
          </div>
        </div>
        <div className="card px-5 py-4">
          <div className="flex items-center gap-2 text-sm text-brand-mist"><Toggle checked={mfa} onChange={setMfa} />全体非管理员成员强制二次验证（MFA）</div>
          <p className="mt-1 text-2xs text-brand-sage">也可按权限组单独设置。未绑定验证器的成员进入数据室时会被引导去绑定。</p>
        </div>
        <div className="flex justify-end">
          <button className="btn-primary" disabled={a.pending} onClick={() => a.exec(() => saveSecuritySettings(projectId, { watermark: w, download: { modes: d.modes as VdrDownloadMode[], irmExpiryDays: d.irmExpiryDays, irmPrintLimit: d.irmPrintLimit }, requireMfa: mfa }), () => router.refresh())}>
            {a.pending ? "保存中…" : "保存设置"}
          </button>
        </div>
      </div>
      <div>
        <div className="mb-2 text-xs text-brand-sage">水印预览（以您的身份）</div>
        <div className="relative h-[560px] overflow-hidden rounded-md border border-line bg-white" style={{ backgroundImage: wmBackground(sample, w.opacity, w.size, w.density) }}>
          <div className="space-y-3 p-10 opacity-60">
            {Array.from({ length: 14 }).map((_, i) => <div key={i} className="h-2.5 rounded bg-neutral-300" style={{ width: `${60 + ((i * 37) % 40)}%` }} />)}
          </div>
        </div>
        <div className="mt-2 break-all font-num text-2xs text-brand-sage">{sample}</div>
      </div>
    </div>
  );
}

/* ================================ IRM ================================ */

const ISS_KIND: Record<Iss["kind"], string> = { package: "IRM 受控包", pdf: "加密 PDF", office: "加密 Office", watermark: "水印副本" };

function IrmTab({ projectId, issues }: { projectId: string; issues: Iss[] }) {
  const router = useRouter();
  const a = useAction();
  const [kind, setKind] = useState<"all" | Iss["kind"]>("package");
  const [status, setStatus] = useState<"all" | "active" | "revoked">("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Iss | null>(null);
  const [pw, setPw] = useState<{ id: string; pw: string } | null>(null);
  const [reason, setReason] = useState("");
  const rows = issues.filter((i) => (kind === "all" || i.kind === kind) && (status === "all" || (status === "revoked" ? !!i.revokedAt : !i.revokedAt))
    && (!q || `${i.file} ${i.user} ${i.email}`.toLowerCase().includes(q.toLowerCase())));
  const pk = issues.filter((i) => i.kind === "package");
  const stat = { total: pk.length, active: pk.filter((i) => !i.revokedAt && !i.expired).length, revoked: pk.filter((i) => i.revokedAt).length, opens: pk.reduce((s, i) => s + i.openCount, 0) };
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <>
      <div className="mb-4 grid grid-cols-4 gap-3">
        {[["已签发受控包", stat.total], ["有效中", stat.active], ["已远程撤销", stat.revoked], ["累计打开次数", stat.opens]].map(([l, v]) => (
          <div key={l} className="card px-4 py-3"><div className="text-2xs text-brand-sage">{l}</div><div className="mt-1 font-num text-xl text-brand-paper">{v}</div></div>
        ))}
      </div>
      <p className="mb-3 text-2xs leading-relaxed text-brand-sage">IRM 受控包（.fasec）每次打开都需联网回本平台验权：撤销、到期、成员失效或门禁不通过时立即无法打开，已打开的阅读器会在下一次心跳（≤60 秒）时清除内容。加密 PDF / Office 与水印副本离开 VDR 后无法收回，仅能通过水印与追踪编号溯源。</p>
      <Alert>{a.error}</Alert>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className="input w-auto py-1 text-xs" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="all">全部类型</option>{Object.entries(ISS_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="input w-auto py-1 text-xs" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">全部状态</option><option value="active">未撤销</option><option value="revoked">已撤销</option>
        </select>
        <input className="input w-56 py-1 text-xs" placeholder="搜索文件 / 用户" value={q} onChange={(e) => setQ(e.target.value)} />
        {sel.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <input className="input w-48 py-1 text-xs" placeholder="撤销原因（可选）" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="btn border border-danger/50 bg-danger/15 text-xs text-danger hover:bg-danger/25" disabled={a.pending}
              onClick={() => a.exec(() => revokeIrm(projectId, [...sel], reason), () => { setSel(new Set()); setReason(""); router.refresh(); })}><Ban size={13} />远程撤销所选 {sel.size} 个</button>
          </div>
        )}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1080px]">
          <thead><tr><th className="th w-8" /><th className="th">文件</th><th className="th w-44">接收人</th><th className="th w-24">类型</th><th className="th w-44">策略</th><th className="th w-40">打开</th><th className="th w-32">签发</th><th className="th w-24">状态</th><th className="th w-28" /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td className="td text-center text-xs text-brand-sage" colSpan={9}>暂无记录</td></tr>}
            {rows.map((i) => {
              const revocable = !i.revokedAt && i.kind === "package";
              return (
                <tr key={i.id} className={cn("hover:bg-ink-850/60", i.revokedAt && "opacity-60")}>
                  <td className="td">{revocable && <input type="checkbox" checked={sel.has(i.id)} onChange={() => toggle(i.id)} />}</td>
                  <td className="td"><div className="truncate text-brand-paper" title={i.file}>{i.file}</div><div className="font-num text-2xs text-brand-sage">#{i.id.slice(0, 8)}</div></td>
                  <td className="td"><div className="text-brand-mist">{i.user}</div><div className="text-2xs text-brand-sage">{i.email}</div></td>
                  <td className="td text-xs">{ISS_KIND[i.kind]}</td>
                  <td className="td text-2xs text-brand-sage">
                    {i.kind === "package" ? <>
                      <div className={cn(i.expired && "text-danger")}>至 {i.policy.expiresAt ? fmtDateTime(i.policy.expiresAt) : "不限"}</div>
                      <div>打印 {i.printsUsed}/{i.policy.printLimit ?? 0} · {i.policy.allowCopy ? "可复制" : "禁止复制"}</div>
                    </> : i.kind === "watermark" ? "—" : (i.policy.allowCopy ? "可复制" : "禁止复制")}
                  </td>
                  <td className="td text-2xs text-brand-sage">{i.kind === "package" ? <>{i.openCount} 次{i.lastOpenedAt && <div>最近 {fmtDateTime(i.lastOpenedAt)}{i.lastIp ? ` · ${i.lastIp}` : ""}</div>}</> : "—"}</td>
                  <td className="td font-num text-2xs text-brand-sage">{fmtDateTime(i.createdAt)}</td>
                  <td className="td">{i.revokedAt ? <span title={i.revokeReason ?? ""}><Badge tone="danger">已撤销</Badge></span> : i.expired ? <Badge tone="warn">已到期</Badge> : i.kind === "package" ? <Badge tone="mid">有效</Badge> : <Badge>仅溯源</Badge>}</td>
                  <td className="td whitespace-nowrap text-right">
                    {i.kind === "package" && !i.revokedAt && <button className="btn-ghost btn-sm" title="调整有效期 / 打印次数" onClick={() => setEdit(i)}><Pencil size={13} /></button>}
                    {revocable && <button className="btn-ghost btn-sm text-danger" title="远程撤销" onClick={() => a.exec(() => revokeIrm(projectId, [i.id], ""), () => router.refresh())}><Ban size={13} /></button>}
                    {i.kind === "package" && i.revokedAt && <button className="btn-ghost btn-sm" title="恢复" onClick={() => a.exec(() => restoreIrm(projectId, i.id), () => router.refresh())}><Undo2 size={13} /></button>}
                    {i.kind === "package" && (
                      <ConfirmButton className="btn-ghost btn-sm" title="撤销该用户的全部受控副本" confirmText="全部撤销" body={<>远程撤销 <b>{i.user}</b> 在本项目的全部 IRM 受控副本？</>}
                        onConfirm={() => a.exec(() => revokeIrmOfUser(projectId, i.userId), () => router.refresh())}><Users size={13} /></ConfirmButton>
                    )}
                    {i.hasPassword && <button className="btn-ghost btn-sm" title="查看打开密码" onClick={() => a.exec(() => irmPassword(projectId, i.id), (r) => r.data && setPw({ id: i.id, pw: r.data }))}><KeyRound size={13} /></button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pw && (
        <Modal open onClose={() => setPw(null)} title="加密副本打开密码">
          <div className="rounded border border-line bg-ink-850 px-4 py-3 text-center font-num text-lg tracking-wider text-brand-paper">{pw.pw}</div>
          <p className="mt-2 text-2xs text-brand-sage">本次查看已记入安全日志。</p>
        </Modal>
      )}
      {edit && <IrmPolicyDialog projectId={projectId} issue={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function IrmPolicyDialog({ projectId, issue, onClose }: { projectId: string; issue: Iss; onClose: () => void }) {
  const router = useRouter();
  const a = useAction();
  const [exp, setExp] = useState(toLocal(issue.policy.expiresAt));
  const [pl, setPl] = useState(issue.policy.printLimit ?? 0);
  return (
    <Modal open onClose={onClose} title={`调整受控策略 · ${issue.file}`}
      footer={<><button className="btn-secondary" onClick={onClose}>取消</button><button className="btn-primary" disabled={a.pending} onClick={() => a.exec(() => updateIrmPolicy(projectId, issue.id, { expiresAt: fromLocal(exp), printLimit: pl }), () => { router.refresh(); onClose(); })}>保存</button></>}>
      <Alert>{a.error}</Alert>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-brand-sage">有效期至<input type="datetime-local" className="input mt-1" value={exp} onChange={(e) => setExp(e.target.value)} /></label>
        <label className="text-xs text-brand-sage">打印次数上限（已用 {issue.printsUsed}）<input type="number" min={0} className="input mt-1" value={pl} onChange={(e) => setPl(Number(e.target.value))} /></label>
      </div>
      <p className="mt-2 text-2xs text-brand-sage">策略保存在服务器上，接收人下次打开或阅读器下一次心跳时生效，无需重新下载文件。</p>
    </Modal>
  );
}

/* ================================ 安全日志 ================================ */

const GATE_LABEL: Record<string, string> = {
  no_access: "无权访问", no_group: "未分配权限组", expired: "访问已到期", not_started: "访问未开始", window: "不在访问时段", ip: "IP 不在白名单",
  domain: "邮箱域名受限", mfa_setup: "未开启 MFA", mfa_reauth: "未通过 MFA", concurrent: "并发会话超限", nda: "未签署 NDA",
};

function LogTab({ events }: { events: Ev[] }) {
  const [f, setF] = useState("");
  const actions = [...new Set(events.map((e) => e.action))];
  const rows = events.filter((e) => !f || e.action === f);
  const tone = (a: string) => (/denied|revoke|new_device/.test(a) ? "text-warn" : "text-brand-mist");
  const brief = (e: Ev) => {
    const d = e.detail;
    if (e.action === "access_denied") return GATE_LABEL[String(d.code)] ?? String(d.code ?? "");
    if (e.action === "new_device") return [d.device, d.ip].filter(Boolean).join(" · ");
    if (e.action === "session_revoke") return d.reason === "concurrent" ? "超出并发会话上限" : d.reason === "admin" ? `管理员强制下线 ${d.count ?? ""} 个会话` : String(d.reason ?? "");
    if (e.action.startsWith("download_") || e.action.startsWith("irm_")) return [d.traceId && `追踪 #${d.traceId}`, d.reason, d.count !== undefined && `${d.count} 个`, d.pages && `${d.pages} 页`, d.error].filter(Boolean).join(" · ");
    if (e.action === "invite" || e.action === "invite_accept") return [d.email, d.group].filter(Boolean).join(" · ");
    return "";
  };
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <select className="input w-auto py-1 text-xs" value={f} onChange={(e) => setF(e.target.value)}>
          <option value="">全部事件（最近 400 条）</option>
          {actions.map((a) => <option key={a} value={a}>{VDR_ACTION_LABEL[a] ?? a}</option>)}
        </select>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead><tr><th className="th w-36">时间</th><th className="th w-32">用户</th><th className="th w-36">事件</th><th className="th">对象 / 详情</th><th className="th w-32">IP</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td className="td text-center text-xs text-brand-sage" colSpan={5}>暂无事件</td></tr>}
            {rows.map((e) => (
              <tr key={e.id} className="hover:bg-ink-850/60">
                <td className="td font-num text-2xs text-brand-sage">{fmtDateTime(e.at)}</td>
                <td className="td text-xs text-brand-mist">{e.user}</td>
                <td className={cn("td text-xs", tone(e.action))}>{VDR_ACTION_LABEL[e.action] ?? e.action}</td>
                <td className="td text-xs text-brand-sage">{e.file && <span className="text-brand-mist">{e.file}</span>}{e.file && brief(e) ? " · " : ""}{brief(e)}</td>
                <td className="td font-num text-2xs text-brand-sage">{e.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
