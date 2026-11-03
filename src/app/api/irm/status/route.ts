import { NextResponse, type NextRequest } from "next/server";
import { checkIrm } from "@/lib/vdr/irm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 阅读器每分钟心跳：被撤销 / 到期 / 失去权限时立即清除已解密内容 */
export async function POST(req: NextRequest) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  const r = await checkIrm(String(id ?? ""));
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 200, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ ok: true, printsUsed: r.issue.printsUsed, printLimit: r.issue.policy.printLimit ?? 0 }, { headers: { "Cache-Control": "no-store" } });
}
