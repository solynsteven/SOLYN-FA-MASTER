import { TrackerPage } from "@/components/tracker/TrackerPage";

export const maxDuration = 60;
export const metadata = { title: "Q&A 问答跟踪" };

export default async function QaPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <TrackerPage projectId={projectId} moduleKey="qa" />;
}
