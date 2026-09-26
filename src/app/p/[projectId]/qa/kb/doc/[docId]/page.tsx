import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { qaAreas, qaDocs, users } from "@/db/schema";
import { requireProject } from "@/lib/auth";
import { qaViewer, canSee } from "@/lib/qa/access";
import { parseMd, queryTerms } from "@/lib/qa/kb-core";
import { renderMd } from "@/lib/qa/markdown";
import { fmtDateTime } from "@/lib/format";
import { QaNoAccess } from "@/components/qa/QaTabs";
import { GroupBadge } from "@/components/qa/KbClient";
import { DocView } from "@/components/qa/DocView";

export const metadata = { title: "知识库文件" };

export default async function DocPage({ params, searchParams }: { params: Promise<{ projectId: string; docId: string }>; searchParams: Promise<{ c?: string; q?: string }> }) {
  const { projectId, docId } = await params;
  const sp = await searchParams;
  const { project } = await requireProject(projectId, { module: "qa" });
  const viewer = await qaViewer(projectId);
  if (!viewer || viewer.rank === 0) return <QaNoAccess />;
  if (!/^[0-9a-f-]{36}$/i.test(docId)) notFound();
  const [row] = await db
    .select({ doc: qaDocs, area: qaAreas, uploader: users.name })
    .from(qaDocs)
    .innerJoin(qaAreas, eq(qaAreas.id, qaDocs.areaId))
    .leftJoin(users, eq(users.id, qaDocs.uploadedBy))
    .where(and(eq(qaDocs.id, docId), eq(qaDocs.projectId, projectId)));
  if (!row) notFound();
  if (!canSee(viewer.rank, row.area.accessGroup)) return <QaNoAccess />;
  const chunks = parseMd(row.doc.content);
  const sections = chunks.map((c) => ({ ord: c.ord, heading: c.heading, depth: c.path.length, lines: [c.lineStart, c.lineEnd] as [number, number], html: renderMd(c.raw) }));
  return (
    <>
      <Link href={`/p/${projectId}/qa/kb${sp.q ? `?q=${encodeURIComponent(sp.q)}` : ""}`} className="mb-3 inline-flex items-center gap-1.5 text-xs text-brand-sage hover:text-brand-paper">
        <ArrowLeft size={13} />{sp.q ? "返回搜索结果" : "返回项目知识库"}
      </Link>
      <div className="mb-5">
        <div className="eyebrow mb-2">{project.code} · Q&A 文件区 · {row.area.name}</div>
        <h1 className="text-[22px] font-medium leading-tight text-brand-paper">{row.doc.title || row.doc.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-brand-sage">
          <span className="font-num">D{row.doc.seq}</span>·<span>{row.doc.name}</span>{row.doc.version > 1 && <span>· v{row.doc.version}</span>}
          · <GroupBadge g={row.area.accessGroup} /> · <span>更新 {fmtDateTime(row.doc.updatedAt)}{row.uploader ? ` · ${row.uploader}` : ""}</span>
        </div>
      </div>
      <DocView sections={sections} focus={sp.c ? Number(sp.c) : null} terms={queryTerms(sp.q ?? "")} docSeq={row.doc.seq} />
    </>
  );
}
