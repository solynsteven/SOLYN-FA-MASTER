import { redirect } from "next/navigation";
import { AuthShell } from "../AuthShell";
import { LoginForm } from "./LoginForm";
import { hasAnyUser } from "../actions";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "登录" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!(await hasAnyUser())) redirect("/setup");
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  return (
    <AuthShell>
      <h2 className="text-xl font-medium text-brand-pine">登录</h2>
      <p className="mb-7 mt-1 text-sm text-brand-sage">使用 Solyn 分配的账号登录 FA MASTER</p>
      <LoginForm next={next ?? "/"} />
    </AuthShell>
  );
}
