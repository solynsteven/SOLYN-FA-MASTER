import { NextResponse, type NextRequest } from "next/server";
import { checkIrm, markOpened } from "@/lib/vdr/irm";
import { decrypt } from "@/lib/crypto";
import { logVdr } from "@/lib/vdr/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 安全阅读器打开 .fasec：验权通过后下发解密密钥与使用策略 */
export async function POST(req: NextRequest) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  const r = await checkIrm(String(id ?? ""));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status, headers: { "Cache-Control": "no-store" } });
  await markOpened(r.issue);
  await logVdr(r.issue.projectId, r.issue.userId, "irm_open", { fileId: r.issue.fileId, detail: { issueId: r.issue.id, name: r.issue.fileName } });
  const p = r.issue.policy;
  return NextResponse.json({
    key: decrypt(r.issue.keyEnc!), name: r.issue.fileName, watermark: r.watermark,
    policy: { expiresAt: p.expiresAt ?? null, allowCopy: !!p.allowCopy, printLimit: p.printLimit ?? 0, printsUsed: r.issue.printsUsed },
  }, { headers: { "Cache-Control": "no-store" } });
}
