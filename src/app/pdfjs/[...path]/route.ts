import { NextResponse, type NextRequest } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

export const runtime = "nodejs";

/**
 * 浏览器端 pdf.js（安全阅读器）所需的 CMap 编码表与标准字体。
 * 未嵌入字体的日文 / 中文 PDF（如 MS 明朝）必须有 CMap 才能显示文字。仅限登录用户（由 middleware 保证）。
 */
const DIRS = (() => {
  const dirs = [path.join(process.cwd(), "node_modules", "pdfjs-node")];
  try { dirs.push(path.dirname(createRequire(path.join(process.cwd(), "package.json")).resolve("pdfjs-node/package.json"))); } catch {}
  return [...new Set(dirs)];
})();

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  const [sub, name] = parts ?? [];
  if (parts?.length !== 2 || !["cmaps", "standard_fonts"].includes(sub) || !/^[A-Za-z0-9._-]+$/.test(name ?? "")) return new NextResponse("Not found", { status: 404 });
  for (const d of DIRS) {
    try {
      const buf = await fs.promises.readFile(path.join(d, sub, name));
      return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, max-age=604800, immutable" } });
    } catch {}
  }
  return new NextResponse("Not found", { status: 404 });
}
