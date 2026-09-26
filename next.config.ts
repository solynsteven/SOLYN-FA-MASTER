import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
  serverExternalPackages: ["pg", "pdfkit", "exceljs"],
  // PDF 字体、品牌 Logo 与 Skill 说明在运行时通过 fs 读取，需要打进 Vercel 函数包
  outputFileTracingIncludes: {
    "/p/[projectId]/[module]/export": ["./assets/fonts/**/*", "./public/brand/**/*"],
    "/p/[projectId]/[module]": ["./skills/**/*"],
  },
};

export default nextConfig;
