import { HistoryPage } from "@/components/tracker/HistoryPage";

export const metadata = { title: "Q&A 变更记录" };

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <HistoryPage projectId={projectId} moduleKey="qa" />;
}
