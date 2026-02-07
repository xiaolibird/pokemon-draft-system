"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Admin]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-2xl font-black">管理端出错了</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          后台或当前页面遇到问题。请重试，或返回管理首页。
        </p>
        <button
          onClick={() => reset()}
          className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white transition hover:bg-blue-700"
        >
          重试
        </button>
        <Link
          href="/admin/dashboard"
          className="block text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          返回管理首页
        </Link>
      </div>
    </div>
  );
}
