import { redirect } from "next/navigation";
import { AuthShell } from "../AuthShell";
import { SetupForm } from "./SetupForm";
import { hasAnyUser } from "../actions";

export const metadata = { title: "系统初始化" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await hasAnyUser()) redirect("/login");
  return (
    <AuthShell>
      <h2 className="text-xl font-medium text-brand-pine">系统初始化</h2>
      <p className="mb-7 mt-1 text-sm text-brand-sage">首次部署，请创建第一个全局管理员账号。此页面在创建后自动关闭。</p>
      <SetupForm />
    </AuthShell>
  );
}
