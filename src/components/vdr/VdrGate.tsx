import Link from "next/link";
import { ShieldAlert, FileSignature, KeyRound, Clock, Globe, LogOut, Users } from "lucide-react";
import type { GateFail } from "@/lib/vdr/access";
import { logoutAction } from "@/app/(auth)/actions";

const ICON: Partial<Record<GateFail["code"], typeof ShieldAlert>> = { nda: FileSignature, mfa_setup: KeyRound, mfa_reauth: KeyRound, window: Clock, expired: Clock, not_started: Clock, ip: Globe, concurrent: Users };
const TITLE: Record<GateFail["code"], string> = {
  no_access: "无法访问数据室", no_group: "尚未分配权限组", expired: "访问权限已到期", not_started: "访问尚未开始", window: "当前不在访问时段",
  ip: "网络位置受限", domain: "邮箱域名受限", mfa_setup: "需要开启二次验证", mfa_reauth: "需要重新验证身份", concurrent: "账号已在其他设备登录", nda: "请先签署保密协议",
};

/** 数据室门禁未通过时的提示页 */
export function VdrGate({ projectId, fail }: { projectId: string; fail: GateFail }) {
  const Icon = ICON[fail.code] ?? ShieldAlert;
  return (
    <div className="card mx-auto max-w-xl px-8 py-12 text-center">
      <Icon size={30} strokeWidth={1.3} className="mx-auto mb-4 text-brand-sage" />
      <div className="text-base font-medium text-brand-paper">{TITLE[fail.code]}</div>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-brand-mist/85">{fail.message}</p>
      <div className="mt-6 flex justify-center gap-2">
        {fail.code === "nda" && <Link href={`/p/${projectId}/vdr/nda`} className="btn-primary"><FileSignature size={14} />阅读并签署 NDA</Link>}
        {fail.code === "mfa_setup" && <Link href={`/account?mfa=1&back=${encodeURIComponent(`/p/${projectId}/vdr`)}`} className="btn-primary"><KeyRound size={14} />去绑定验证器</Link>}
        {(fail.code === "mfa_reauth" || fail.code === "concurrent") && (
          <form action={logoutAction}><button className="btn-primary"><LogOut size={14} />重新登录</button></form>
        )}
      </div>
      <p className="mt-6 text-2xs text-brand-sage">本次访问尝试已被记录。如有疑问请联系项目管理员。</p>
    </div>
  );
}
