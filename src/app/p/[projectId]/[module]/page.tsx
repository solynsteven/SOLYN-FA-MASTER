import { notFound } from "next/navigation";
import { requireProject } from "@/lib/auth";
import { moduleDef, isTrackerModule, type ModuleKey } from "@/lib/modules";
import { PageHeader } from "@/components/PageHeader";
import { ComingSoon } from "@/components/ComingSoon";
import { TrackerPage } from "@/components/tracker/TrackerPage";

export const maxDuration = 60; // Excel 导入需要较长执行时间

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  return { title: moduleDef(module)?.label ?? "模块" };
}

export default async function ModulePage({ params }: { params: Promise<{ projectId: string; module: string }> }) {
  const { projectId, module } = await params;
  const mod = moduleDef(module);
  if (!mod || mod.key === "home") notFound();
  if (isTrackerModule(mod.key)) return <TrackerPage projectId={projectId} moduleKey={mod.key} />;
  const { project } = await requireProject(projectId, { module: mod.key as ModuleKey });
  return (
    <>
      <PageHeader eyebrow={`${project.code} · ${mod.en}`} title={mod.label} />
      <ComingSoon mod={mod} />
    </>
  );
}
