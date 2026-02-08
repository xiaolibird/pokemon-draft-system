/**
 * 字体加载模块
 * 处理 Google Fonts 加载失败的情况，提供系统字体回退
 */

type FontConfig = {
  variable: string;
};

let geistSans: FontConfig = { variable: "" };
let geistMono: FontConfig = { variable: "" };

// 检查是否应该跳过 Google Fonts 加载（用于离线构建）
const skipGoogleFonts = process.env.SKIP_GOOGLE_FONTS === "true";

if (!skipGoogleFonts) {
  try {
    // 动态导入字体模块
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const fontModule = require("next/font/google");
    const { Geist, Geist_Mono } = fontModule;

    geistSans = Geist({
      variable: "--font-geist-sans",
      subsets: ["latin"],
      display: "swap",
      fallback: [
        "ui-sans-serif",
        "system-ui",
        "-apple-system",
        "BlinkMacSystemFont",
        "Segoe UI",
        "Roboto",
        "Helvetica Neue",
        "Arial",
        "sans-serif",
      ],
      adjustFontFallback: true,
    });

    geistMono = Geist_Mono({
      variable: "--font-geist-mono",
      subsets: ["latin"],
      display: "swap",
      fallback: [
        "ui-monospace",
        "SFMono-Regular",
        "SF Mono",
        "Menlo",
        "Consolas",
        "Liberation Mono",
        "monospace",
      ],
      adjustFontFallback: true,
    });
  } catch (error: any) {
    // 字体加载失败时，记录警告但不中断构建
    // CSS 中的 fallback 会确保使用系统字体
    const errorMessage = error?.message || error?.toString() || "Unknown error";

    // 仅在开发环境或明确启用调试时输出警告
    if (
      process.env.NODE_ENV === "development" ||
      process.env.DEBUG_FONT_LOAD === "true"
    ) {
      console.warn(
        "[Font Load] Google Fonts unavailable, using system fonts fallback.",
        "Error:",
        errorMessage,
      );
    }

    // geistSans 和 geistMono 保持为空字符串
    // CSS 中的 fallback 会确保使用系统字体
  }
} else {
  // 明确跳过 Google Fonts 加载
  if (process.env.NODE_ENV === "development") {
    console.info("[Font Load] Skipping Google Fonts (SKIP_GOOGLE_FONTS=true)");
  }
}

export { geistSans, geistMono };
