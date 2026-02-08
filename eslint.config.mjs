import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Ignore data files with many unused parameters (function signatures)
    "app/lib/data/pokemon/**",
  ]),
  {
    rules: {
      // 放宽 any 类型检查 - 允许在某些情况下使用 any（不影响运行）
      "@typescript-eslint/no-explicit-any": "warn", // 从 error 改为 warn

      // 允许未使用的变量（某些情况下是必要的，如 catch 块中的 error）
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_", // 允许以下划线开头的未使用参数
          varsIgnorePattern: "^_", // 允许以下划线开头的未使用变量
          caughtErrorsIgnorePattern: "^_", // 允许 catch 块中未使用的错误变量
          destructuredArrayIgnorePattern: "^_", // 允许解构数组中未使用的变量
        },
      ],

      // React Hooks 依赖项 - 改为警告，避免影响性能优化
      "react-hooks/exhaustive-deps": "warn",

      // setState in effect - 改为警告（某些情况下是必要的）
      "react-hooks/set-state-in-effect": "warn",

      // 允许使用 <img> 标签（某些情况下 Next.js Image 不适用）
      "@next/next/no-img-element": "warn",

      // 允许使用 <a> 标签（某些情况下 Link 不适用，如错误页面）
      "@next/next/no-html-link-for-pages": "warn",
    },
  },
]);

export default eslintConfig;
