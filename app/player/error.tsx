'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function PlayerError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Player]', error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-2xl font-black">选手端出错了</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          选秀房间或当前页面遇到问题。请重试，或返回登录页重新进入。
        </p>
        <button
          onClick={() => reset()}
          className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white transition hover:bg-blue-700"
        >
          重试
        </button>
        <Link
          href="/player/login"
          className="block text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          返回选手登录
        </Link>
      </div>
    </div>
  )
}
