import { requireProject } from "@/lib/auth";
import { qaViewer } from "@/lib/qa/access";
import { loadKb, buildSources, searchSources } from "@/lib/qa/kb";
import { queryTerms } from "@/lib/qa/kb-core";
import { seedDefaultFields } from "@/lib/project-service";
import { PageHeader } from "@/components/PageHeader";
import { QaTabs, QaNoAccess } from "@/components/qa/QaTabs";
import { KbClient, type KbHitView, type KbRecord } from "@/components/qa/KbClient";

export const metadata = { title: "项目知识库" };

export default async function KbPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ q?: string; scope?: string; area?: string }> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { project } = await requireProject(projectId, { module: "qa" });
  const viewer = await qaViewer(projectId);
  if (!viewer || viewer.rank === 0) {
    return (
      <>
        <PageHeader eyebrow={`${project.code} · Q&A · Knowledge Base`} title="项目知识库" />
        <QaNoAccess />
      </>
    );
  }
  await seedDefaultFields(projectId, "qa");
  const q = (sp.q ?? "").trim().slice(0, 200);
  const scope = sp.scope === "qa" || sp.scope === "doc" ? sp.scope : "all";
  const kb = await loadKb(projectId, viewer, { withContent: !!q });
  let hits: KbHitView[] = [];
  if (q) {
    let sources = buildSources(kb);
    if (sp.area) sources = sources.filter((x) => x.kind === "qa" || kb.docs.find((d) => d.id === x.id)?.areaId === sp.area);
    hits = searchSources(sources, q, scope).map((h) => ({
      kind: h.src.kind, ref: h.src.ref, id: h.src.id, anchor: h.src.anchor ?? null, title: h.src.title, sub: h.src.sub,
      group: h.src.group, area: h.src.area ?? null, lines: h.src.lines ?? null, snippet: h.snippet, score: h.score,
    }));
  }
  const records: KbRecord[] = kb.items.map((it) => ({ id: it.id, data: it.data, updatedAt: it.updatedAt.toISOString() }));
  return (
    <>
      <PageHeader
        eyebrow={`${project.code} · Q&A · Knowledge Base`}
        title="项目知识库"
        desc={`汇集 Q&A 记录与各「Q&A 文件区」中的 .md 访谈 / 会议记录，按权限组开放（ADM > SEL > EXC > DD）。${viewer.isManager ? "" : `你的权限组：${viewer.group}。`}`}
      />
      <QaTabs projectId={projectId} active="kb" />
      <KbClient
        projectId={projectId}
        canManage={viewer.isManager}
        q={q}
        scope={scope}
        areaFilter={sp.area ?? ""}
        terms={queryTerms(q)}
        areas={kb.areas.map((a) => ({ id: a.id, name: a.name, accessGroup: a.accessGroup, description: a.description, docs: kb.docs.filter((d) => d.areaId === a.id).length }))}
        docs={kb.docs.map((d) => ({ id: d.id, areaId: d.areaId, seq: d.seq, name: d.name, title: d.title, size: d.size, version: d.version, uploader: d.uploader ?? "", updatedAt: d.updatedAt.toISOString() }))}
        hits={hits}
        records={records}
        fields={kb.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, role: f.role }))}
        faTitles={Object.fromEntries(kb.faTitle)}
      />
    </>
  );
}
