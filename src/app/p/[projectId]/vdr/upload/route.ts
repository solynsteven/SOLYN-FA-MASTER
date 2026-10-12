import { NextResponse, type NextRequest } from "next/server";
import { handleUpload, handleUploadPresigned, type HandleUploadBody, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { issueSignedToken } from "@vercel/blob";
import { getProjectAccess } from "@/lib/auth";
import { blobAuth, blobToken, blobStoreId, blobWebhookKey, STORAGE_MISSING } from "@/lib/vdr/storage";

export const runtime = "nodejs";

const MAX = 500 * 1024 * 1024;

/**
 * Vercel Blob 浏览器直传：服务器只负责鉴权并签发一次性上传凭证。
 *  - 旧版连接（BLOB_READ_WRITE_TOKEN）：handleUpload 签发 client token
 *  - 新版连接（BLOB_STORE_ID + OIDC）：handleUploadPresigned 签发预签名上传地址
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const auth = blobAuth();
  if (!auth) return NextResponse.json({ error: STORAGE_MISSING }, { status: 400 });
  const body = await req.json();
  const check = async (pathname: string) => {
    const a = await getProjectAccess(projectId);
    if (!a || !a.canManage || !a.enabledModules.has("vdr")) throw new Error("仅项目管理员可上传文件");
    if (!pathname.startsWith(`vdr/${projectId}/`)) throw new Error("非法的存储路径");
    return a;
  };
  try {
    if (auth === "token") {
      const json = await handleUpload({
        token: blobToken(),
        body: body as HandleUploadBody,
        request: req,
        onBeforeGenerateToken: async (pathname) => {
          const a = await check(pathname);
          return { maximumSizeInBytes: MAX, addRandomSuffix: true, tokenPayload: JSON.stringify({ u: a.user.id }) };
        },
      });
      return NextResponse.json(json);
    }
    const json = await handleUploadPresigned({
      body: body as HandleUploadPresignedBody,
      request: req,
      // 本站不使用上传完成回调（上传后由浏览器调用 registerFile 登记），公钥仅用于满足 SDK 校验
      webhookPublicKey: blobWebhookKey() ?? "unused",
      getSignedToken: async (pathname) => {
        await check(pathname);
        const token = await issueSignedToken({
          storeId: blobStoreId(),
          pathname,
          operations: ["put"],
          maximumSizeInBytes: MAX,
          validUntil: Date.now() + 30 * 60 * 1000,
        });
        return { token, urlOptions: { addRandomSuffix: true, maximumSizeInBytes: MAX } };
      },
    });
    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "上传失败";
    console.error("[vdr upload]", msg);
    return NextResponse.json({ error: /oidc/i.test(msg) ? `Blob 存储认证失败（${msg}）。请确认 Vercel 项目 Settings → Security 中已启用 OIDC Federation，并已在连接 Blob 后 Redeploy。` : msg }, { status: 400 });
  }
}

/** 上传前自检：确认存储已配置、当前用户可上传，并（OIDC 模式）实际签发一次凭证以验证认证 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const a = await getProjectAccess(projectId);
  if (!a || !a.canManage || !a.enabledModules.has("vdr")) return NextResponse.json({ ok: false, error: "仅项目管理员可上传文件" }, { status: 403 });
  const auth = blobAuth();
  if (!auth) return NextResponse.json({ ok: false, error: STORAGE_MISSING });
  if (auth === "oidc") {
    try {
      await issueSignedToken({ storeId: blobStoreId(), pathname: `vdr/${projectId}/_probe`, operations: ["put"], validUntil: Date.now() + 60_000 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[vdr upload probe]", msg);
      return NextResponse.json({ ok: false, auth, error: `Blob 存储认证失败：${msg}。请确认 Vercel 项目 Settings → Security 中 OIDC Federation 已启用，且连接 Blob 后已 Redeploy。` });
    }
  }
  return NextResponse.json({ ok: true, auth });
}
