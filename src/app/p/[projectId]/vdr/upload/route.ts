import { NextResponse, type NextRequest } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getProjectAccess } from "@/lib/auth";

export const runtime = "nodejs";

/** Vercel Blob 浏览器直传：服务器只负责鉴权并签发一次性上传令牌 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const a = await getProjectAccess(projectId);
        if (!a || !a.canManage || !a.enabledModules.has("vdr")) throw new Error("仅项目管理员可上传文件");
        if (!pathname.startsWith(`vdr/${projectId}/`)) throw new Error("非法的存储路径");
        return { maximumSizeInBytes: 500 * 1024 * 1024, addRandomSuffix: true, tokenPayload: JSON.stringify({ u: a.user.id }) };
      },
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "上传失败" }, { status: 400 });
  }
}
