import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SOLYN FA MASTER", template: "%s · SOLYN FA MASTER" },
  description: "Solyn Advisory 投融资并购 FA 工作平台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* 品牌字体：英文 Jost，中文思源黑体（Noto Sans SC） */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600&family=Noto+Sans+SC:wght@400;500;700&display=swap"
        />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
