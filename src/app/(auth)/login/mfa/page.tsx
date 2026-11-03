import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { readMfaPending } from "@/lib/session";
import { mailEnabled } from "@/lib/mail";
import { AuthShell } from "../../AuthShell";
import { MfaForm } from "./MfaForm";

export const metadata = { title: "二次验证" };
export const dynamic = "force-dynamic";

export default async function MfaPage() {
  const p = await readMfaPending();
  if (!p) redirect("/login");
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, p.userId));
  if (!u) redirect("/login");
  const masked = u.email.replace(/^(.{2}).*(@.*)$/, "$1***$2");
  return (
    <AuthShell>
      <h2 className="text-xl font-medium text-brand-pine">二次验证</h2>
      <p className="mb-7 mt-1 text-sm text-brand-sage">请输入验证器 App（Google / Microsoft Authenticator 等）中的 6 位动态码</p>
      <MfaForm email={masked} emailEnabled={mailEnabled()} />
    </AuthShell>
  );
}
