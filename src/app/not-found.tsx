import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-ink-950 px-6 text-center">
      <Logo variant="white" height={36} />
      <div>
        <div className="font-num text-5xl font-medium text-brand-paper">404</div>
        <p className="mt-2 text-sm text-brand-sage">页面不存在，或您没有访问该项目 / 模块的权限。</p>
      </div>
      <Link href="/" className="btn-primary">返回工作台</Link>
    </div>
  );
}
