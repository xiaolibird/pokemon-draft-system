import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // 生产构建优化：跳过类型检查和 Lint（本地已通过 Check，VPS 仅负责打包）
  // @ts-ignore - Valid config in Next.js 15+, but types might be lagging
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  headers: async () => [
    {
      source: "/pokesprite.png",
      headers: [
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    },
    {
      source: "/api/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "no-store, no-cache, max-age=0, must-revalidate",
        },
        { key: "Pragma", value: "no-cache" },
      ],
    },
    // 先匹配：所有路由默认不缓存（部署后立即看到新页面）
    {
      source: "/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "no-store, no-cache, max-age=0, must-revalidate",
        },
        { key: "Pragma", value: "no-cache" },
        { key: "Expires", value: "0" },
      ],
    },
    // 后匹配覆盖：静态资源长效缓存（Next 会带 hash，新部署=新文件名）
    {
      source: "/_next/static/:path*",
      headers: [
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    },
  ],
};

export default nextConfig;
