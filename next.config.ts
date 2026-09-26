import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
  serverExternalPackages: ["pg", "pdfkit", "exceljs", "mammoth"],
  // PDF 字体、品牌 Logo 与 Skill 说明在运行时通过 fs 读取，需要打进 Vercel 函数包
  outputFileTracingIncludes: {
    "/p/[projectId]/[module]/export": ["./assets/fonts/**/*", "./public/brand/**/*", "./node_modules/pdfkit/js/**/*"],
    "/p/[projectId]/[module]": ["./skills/**/*"],
    "/p/[projectId]/vdr/analytics/export": ["./assets/fonts/**/*", "./public/brand/**/*", "./node_modules/pdfkit/js/**/*"],
    "/p/[projectId]/qa/export": ["./assets/fonts/**/*", "./public/brand/**/*", "./node_modules/pdfkit/js/**/*"],
    "/p/[projectId]/qa/ai/[chatId]/export": ["./assets/fonts/**/*", "./public/brand/**/*", "./node_modules/pdfkit/js/**/*"],
    "/p/[projectId]/qa": ["./skills/**/*"],
  },
};

export default nextConfig;
