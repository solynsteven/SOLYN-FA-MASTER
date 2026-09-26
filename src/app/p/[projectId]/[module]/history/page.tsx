import { notFound } from "next/navigation";
import { moduleDef, isTrackerModule } from "@/lib/modules";
import { HistoryPage } from "@/components/tracker/HistoryPage";

export const metadata = { title: "变更记录" };

export default async function Page({ params }: { params: Promise<{ projectId: string; module: string }> }) {
  const { projectId, module } = await params;
  const mod = moduleDef(module);
  if (!mod || !isTrackerModule(mod.key)) notFound();
  return <HistoryPage projectId={projectId} moduleKey={mod.key} />;
}
