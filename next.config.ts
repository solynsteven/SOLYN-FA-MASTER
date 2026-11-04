import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
  serverExternalPackages: ["pg", "pdfkit", "exceljs", "mammoth", "@napi-rs/canvas", "pdfjs-node", "@cantoo/pdf-lib", "officecrypto-tool", "jszip", "qrcode"],
  // PDF 字体、品牌 Logo 与 Skill 说明在运行时通过 fs 读取，需要打进 Vercel 函数包
  outputFileTracingIncludes: {
    "/p/[projectId]/[module]/export": ["./assets/fonts/**/*", "./public/brand/**/*", "./node_modules/pdfkit/js/**/*"],
    "/p/[projectId]/[module]": ["./skills/**/*"],
    "/p/[projectId]/vdr/analytics/export": ["./assets/fonts/**/*", "./public/brand/**/*", "./node_modules/pdfkit/js/**/*"],
    "/p/[projectId]/qa/export": ["./assets/fonts/**/*", "./public/brand/**/*", "./node_modules/pdfkit/js/**/*"],
    "/p/[projectId]/qa/ai/[chatId]/export": ["./assets/fonts/**/*", "./public/brand/**/*", "./node_modules/pdfkit/js/**/*"],
    "/p/[projectId]/qa": ["./skills/**/*"],
    // VDR 安全预览 / 下载：服务端渲染需要字体、pdf.js 的 CMap 与标准字体
    "/p/[projectId]/vdr/file/[fileId]": ["./assets/fonts/**/*", "./node_modules/pdfjs-node/legacy/build/**/*", "./node_modules/pdfjs-node/cmaps/**/*", "./node_modules/pdfjs-node/standard_fonts/**/*"],
    "/p/[projectId]/vdr/file/[fileId]/page": ["./assets/fonts/**/*", "./node_modules/pdfjs-node/legacy/build/**/*", "./node_modules/pdfjs-node/cmaps/**/*", "./node_modules/pdfjs-node/standard_fonts/**/*"],
    "/p/[projectId]/vdr/file/[fileId]/download": ["./assets/fonts/**/*", "./node_modules/pdfjs-node/legacy/build/**/*", "./node_modules/pdfjs-node/cmaps/**/*", "./node_modules/pdfjs-node/standard_fonts/**/*", "./node_modules/pdfkit/js/**/*"],
    "/pdfjs/[...path]": ["./node_modules/pdfjs-node/cmaps/**/*", "./node_modules/pdfjs-node/standard_fonts/**/*"],
    "/p/[projectId]/vdr/nda/certificate": ["./assets/fonts/**/*", "./public/brand/**/*", "./node_modules/pdfkit/js/**/*"],
  },
};

export default nextConfig;
