import { NextResponse, type NextRequest } from "next/server";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { vdrIrmIssues } from "@/db/schema";
import { checkIrm } from "@/lib/vdr/irm";
import { logVdr } from "@/lib/vdr/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 打印前申请一次打印额度（原子扣减） */
export async function POST(req: NextRequest) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  const r = await checkIrm(String(id ?? ""));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const limit = r.issue.policy.printLimit ?? 0;
  if (limit <= 0) return NextResponse.json({ error: "该受控文件不允许打印" }, { status: 403 });
  const upd = await db.update(vdrIrmIssues).set({ printsUsed: sql`${vdrIrmIssues.printsUsed} + 1` })
    .where(and(eq(vdrIrmIssues.id, r.issue.id), lt(vdrIrmIssues.printsUsed, limit))).returning({ used: vdrIrmIssues.printsUsed });
  if (!upd.length) return NextResponse.json({ error: `打印次数已用完（共 ${limit} 次）` }, { status: 403 });
  await logVdr(r.issue.projectId, r.issue.userId, "irm_print", { fileId: r.issue.fileId, detail: { issueId: r.issue.id, used: upd[0].used, limit } });
  return NextResponse.json({ ok: true, printsUsed: upd[0].used, printLimit: limit });
}
