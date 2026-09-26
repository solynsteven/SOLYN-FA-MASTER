import type { NextRequest } from "next/server";
import { handleTrackerExport } from "@/lib/export/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string; module: string }> }) {
  const { projectId, module } = await params;
  return handleTrackerExport(req, projectId, module);
}
