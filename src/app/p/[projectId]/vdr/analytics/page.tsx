import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireProject } from "@/lib/auth";
import { vdrAnalytics } from "@/lib/vdr/analytics";
import { PageHeader } from "@/components/PageHeader";
import { AnalyticsClient } from "@/components/vdr/AnalyticsClient";

export const metadata = { title: "VDR 访问分析" };
export const dynamic = "force-dynamic";

export default async function VdrAnalyticsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project } = await requireProject(projectId, { module: "vdr", manage: true });
  const data = await vdrAnalytics(projectId);
  return (
    <>
      <Link href={`/p/${projectId}/vdr`} className="mb-3 inline-flex items-center gap-1.5 text-xs text-brand-sage hover:text-brand-paper"><ArrowLeft size={13} />返回 VDR</Link>
      <PageHeader
        eyebrow={`${project.code} · VDR Access Analytics`}
        title="VDR 访问分析"
        desc={`统计最近 ${data.params.windowDays} 天的阅览、打印与下载；买家对比按「所属机构」汇总，不含卖方 FA（ADM）与项目管理员的访问。`}
        actions={<a className="btn-primary" href={`/p/${projectId}/vdr/analytics/export`}>导出 PDF 报告</a>}
      />
      <AnalyticsClient data={data} />
    </>
  );
}
