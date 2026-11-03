import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { userSessions, userDevices } from "@/db/schema";
import { requireUser, getCurrentSession, ROLE_LABEL } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { AccountForms } from "./AccountForms";
import { SecurityForms } from "./SecurityForms";

export const metadata = { title: "账号设置" };
export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ mfa?: string; back?: string }> }) {
  const u = await requireUser();
  const { mfa, back } = await searchParams;
  const cur = await getCurrentSession();
  const [sessions, devices] = await Promise.all([
    db.select().from(userSessions).where(and(eq(userSessions.userId, u.id), isNull(userSessions.revokedAt), gt(userSessions.lastSeenAt, new Date(Date.now() - 7 * 86400_000)))).orderBy(desc(userSessions.lastSeenAt)).limit(20),
    db.select().from(userDevices).where(eq(userDevices.userId, u.id)).orderBy(desc(userDevices.lastSeenAt)).limit(20),
  ]);
  const safeBack = back && back.startsWith("/") && !back.startsWith("//") ? back : null;
  return (
    <>
      <PageHeader eyebrow="Account" title="账号设置" desc={`${u.email} · ${ROLE_LABEL[u.globalRole]}`} />
      <AccountForms name={u.name} title={u.title ?? ""} />
      <SecurityForms
        mfaEnabled={u.mfaEnabled} mfaSince={u.mfaEnabledAt?.toISOString() ?? null} highlight={mfa === "1"} back={safeBack}
        sessions={sessions.map((s) => ({ id: s.id, ip: s.ip, ua: s.userAgent, mfa: s.mfa, createdAt: s.createdAt.toISOString(), lastSeenAt: s.lastSeenAt.toISOString(), current: s.id === cur?.id }))}
        devices={devices.map((d) => ({ id: d.id, ua: d.userAgent, lastIp: d.lastIp, createdAt: d.createdAt.toISOString(), lastSeenAt: d.lastSeenAt.toISOString() }))}
      />
    </>
  );
}
