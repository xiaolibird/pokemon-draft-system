'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/app/lib/api/fetch'

/**
 * 版本检测组件
 * 定期检查服务器版本，发现更新时提示用户刷新
 */
export function VersionChecker() {
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false)
  const [currentVersion] = useState(() => {
    // 在客户端初始化时记录当前版本
    return typeof window !== 'undefined'
      ? (window as any).__BUILD_VERSION__ || 'unknown'
      : 'unknown'
  })

  useEffect(() => {
    // 生产环境才启用版本检测
    if (process.env.NODE_ENV !== 'production') {
      return
    }

    let checkCount = 0
    const MAX_CHECKS = 100 // 最多检查 100 次（约 50 分钟）

    const checkVersion = async () => {
      try {
        checkCount++

        // 超过最大检查次数后停止
        if (checkCount > MAX_CHECKS) {
          clearInterval(intervalId)
          return
        }

        const response = await apiFetch('/api/version', {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
        })

        if (!response.ok) return

        const data = await response.json()

        // 如果版本号不同，提示更新
        if (data.version !== currentVersion && currentVersion !== 'unknown') {
          setShowUpdatePrompt(true)
          clearInterval(intervalId) // 停止继续检查
        }
      } catch (error) {
        // 静默失败，不影响用户体验
        console.debug('版本检测失败:', error)
      }
    }

    // 首次检查延迟 10 秒（避免页面加载时的性能影响）
    const initialTimeout = setTimeout(checkVersion, 10000)

    // 之后每 30 秒检查一次
    const intervalId = setInterval(checkVersion, 30000)

    return () => {
      clearTimeout(initialTimeout)
      clearInterval(intervalId)
    }
  }, [currentVersion])

  const handleRefresh = () => {
    // 清除所有缓存并强制刷新
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach((name) => caches.delete(name))
      })
    }
    window.location.reload()
  }

  const handleDismiss = () => {
    setShowUpdatePrompt(false)
  }

  if (!showUpdatePrompt) return null

  return (
    <div
      className="animate-slide-up fixed right-4 bottom-4 z-50 max-w-sm rounded-lg bg-blue-600 px-6 py-4 text-white shadow-2xl"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 text-2xl">🎉</div>
        <div className="flex-1">
          <h3 className="mb-1 text-lg font-bold">新版本可用</h3>
          <p className="mb-3 text-sm opacity-90">
            检测到系统更新，刷新页面以获取最新功能
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              className="rounded bg-white px-4 py-2 font-medium text-blue-600 transition-colors hover:bg-blue-50"
            >
              立即刷新
            </button>
            <button
              onClick={handleDismiss}
              className="rounded bg-blue-700 px-4 py-2 text-white transition-colors hover:bg-blue-800"
            >
              稍后
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
