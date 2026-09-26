import type { Config } from "tailwindcss";

/**
 * 色板严格取自《Solyn Advisory 品牌手册 v1.0》第 03 章。
 * 深色界面所需的更深底色（ink 系列）由 Deep Pine #16362A 按同一色相加深得到，不引入新色相。
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          green: "#275642", // Solyn Green 主色、强调
          pine: "#16362A", // Deep Pine 深色底、重叠区
          mid: "#3F6E58", // Mid Green 第二块、图表次级
          sage: "#7C9A8B", // Sage 副标题、分隔线、注释
          mist: "#D7E0DA", // Mist 表格底纹、占位块
          paper: "#FAF8F4", // Paper 暖白背景
        },
        ink: {
          950: "#0A1A14", // 应用底色
          900: "#0F241C", // 侧栏
          850: "#122C22",
          800: "#16362A", // = Deep Pine，卡片面
          700: "#1D4133", // 悬停/抬升
          600: "#244B3B",
        },
        line: {
          DEFAULT: "rgba(215,224,218,0.10)",
          strong: "rgba(215,224,218,0.18)",
        },
        danger: "#C8765F",
        warn: "#C9A865",
      },
      fontFamily: {
        sans: ["Jost", "'Noto Sans SC'", "'Source Han Sans SC'", "'PingFang SC'", "'Microsoft YaHei'", "sans-serif"],
        num: ["Jost", "ui-sans-serif", "sans-serif"],
      },
      fontSize: {
        "2xs": ["11px", "16px"],
      },
      boxShadow: {
        panel: "0 1px 0 rgba(215,224,218,0.04) inset, 0 12px 32px -12px rgba(0,0,0,0.5)",
      },
    },
  },
  plugins: [],
};
export default config;
