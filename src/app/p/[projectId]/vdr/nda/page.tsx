import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft, FileDown } from "lucide-react";
import { db } from "@/db";
import { vdrNdaSignatures } from "@/db/schema";
import { requireProject } from "@/lib/auth";
import { vdrContext } from "@/lib/vdr/access";
import { renderNda } from "@/lib/vdr/groups";
import { PageHeader } from "@/components/PageHeader";
import { VdrGate } from "@/components/vdr/VdrGate";
import { NdaSign } from "./NdaSign";

export const metadata = { title: "保密协议" };
export const dynamic = "force-dynamic";

export default async function NdaPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project, user } = await requireProject(projectId, { module: "vdr" });
  const c = (await vdrContext(projectId))!;
  if (c.fail && c.fail.code !== "nda") return (<><PageHeader eyebrow={`${project.code} · NDA`} title="保密协议" /><VdrGate projectId={projectId} fail={c.fail} /></>);
  const s = c.settings;
  const sigs = await db.select().from(vdrNdaSignatures).where(and(eq(vdrNdaSignatures.projectId, projectId), eq(vdrNdaSignatures.userId, user.id))).orderBy(desc(vdrNdaSignatures.signedAt));
  const current = sigs.find((x) => x.version === s.ndaVersion);
  if (!s.ndaRequired && !sigs.length) redirect(`/p/${projectId}/vdr`);
  const content = current?.content ?? renderNda(s.ndaTemplate, { name: user.name, email: user.email, org: c.member?.organization ?? null, projectName: project.name, projectCode: project.code, projectId, date: new Date() });
  return (
    <>
      <Link href={`/p/${projectId}/vdr`} className="mb-3 inline-flex items-center gap-1.5 text-xs text-brand-sage hover:text-brand-paper"><ArrowLeft size={13} />返回 VDR</Link>
      <PageHeader eyebrow={`${project.code} · Non-Disclosure Agreement · v${s.ndaVersion}`} title={current?.title ?? s.ndaTitle}
        desc={current ? "您已签署本版本协议。签署记录与协议全文已留存，可随时下载存证 PDF。" : "请完整阅读以下协议（滚动至底部），勾选确认并输入姓名完成电子签署。签署后方可进入数据室。"}
        actions={current ? <a className="btn-primary" href={`/p/${projectId}/vdr/nda/certificate?sig=${current.id}`}><FileDown size={14} />下载存证 PDF</a> : undefined} />
      <NdaSign projectId={projectId} version={s.ndaVersion} content={content} userName={user.name} signed={current ? { name: current.signedName, at: current.signedAt.toISOString(), hash: current.contentHash } : null} />
      {sigs.filter((x) => x.version !== s.ndaVersion).length > 0 && (
        <div className="mt-6 text-2xs text-brand-sage">历史签署：{sigs.filter((x) => x.version !== s.ndaVersion).map((x) => (
          <a key={x.id} className="ml-2 underline hover:text-brand-paper" href={`/p/${projectId}/vdr/nda/certificate?sig=${x.id}`}>v{x.version}</a>
        ))}</div>
      )}
    </>
  );
}
