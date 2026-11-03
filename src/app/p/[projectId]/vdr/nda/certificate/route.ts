import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { vdrNdaSignatures, users, projectMembers } from "@/db/schema";
import { getProjectAccess } from "@/lib/auth";
import { buildNdaPdf } from "@/lib/export/nda-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** NDA 签署存证 PDF：签署人本人或项目管理员可下载 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const a = await getProjectAccess(projectId);
  if (!a) return new NextResponse("无权访问", { status: 403 });
  const id = req.nextUrl.searchParams.get("sig") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("参数错误", { status: 400 });
  const [sig] = await db.select().from(vdrNdaSignatures).where(and(eq(vdrNdaSignatures.id, id), eq(vdrNdaSignatures.projectId, projectId)));
  if (!sig || (sig.userId !== a.user.id && !a.canManage)) return new NextResponse("记录不存在", { status: 404 });
  const [u] = await db.select().from(users).where(eq(users.id, sig.userId));
  const [m] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, sig.userId)));
  const buf = await buildNdaPdf({
    projectName: a.project.name, projectCode: a.project.code, roomId: `VDR-${a.project.code}-${projectId.slice(0, 6).toUpperCase()}`,
    title: sig.title, version: sig.version, content: sig.content, contentHash: sig.contentHash, signedName: sig.signedName,
    userName: u?.name ?? sig.signedName, email: u?.email ?? "", organization: m?.organization ?? null, signedAt: sig.signedAt, ip: sig.ip, userAgent: sig.userAgent, signatureId: sig.id,
  });
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${a.project.code}_NDA_v${sig.version}_${sig.signedName}.pdf`)}` },
  });
}
