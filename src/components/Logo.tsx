import Image from "next/image";

/**
 * 品牌手册：深色底用反白版（白色 Logo），浅色底用标准版（深色 Logo）。
 * 使用原始文件等比缩放，不重新排字。
 */
export function Logo({ variant = "white", height = 32, className }: { variant?: "white" | "dark"; height?: number; className?: string }) {
  const src = variant === "white" ? "/brand/logo-white.png" : "/brand/logo-dark.png";
  const ratio = variant === "white" ? 154 / 54 : 256 / 90;
  return (
    <Image
      src={src}
      alt="Solyn Advisory"
      width={Math.round(height * ratio)}
      height={height}
      priority
      className={className}
      style={{ height, width: "auto" }}
    />
  );
}

export function ProductMark({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="text-[13px] font-semibold tracking-[0.28em] text-brand-paper">FA MASTER</div>
    </div>
  );
}
