'use client'

import { useEffect } from 'react'

export type ToastType = 'error' | 'warning' | 'success' | 'info'

export interface ToastMessage {
  id: number
  type: ToastType
  title?: string
  message: string
  suggestion?: string
  /** 蛇形：可承受最高价格 */
  maxAffordablePrice?: number
  /** 竞拍：建议最高出价 */
  maxBidAmount?: number
}

interface ToastProps {
  msg: ToastMessage
  onDismiss: () => void
  duration?: number
}

export function Toast({ msg, onDismiss, duration = 5000 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, duration)
    return () => clearTimeout(t)
  }, [onDismiss, duration])

  const bg = {
    error: 'bg-red-500/95 dark:bg-red-900/95 border-red-400/50',
    warning: 'bg-amber-500/95 dark:bg-amber-900/95 border-amber-400/50',
    success: 'bg-green-500/95 dark:bg-green-900/95 border-green-400/50',
    info: 'bg-blue-500/95 dark:bg-blue-900/95 border-blue-400/50',
  }[msg.type]

  const icon = {
    error: '⚠️',
    warning: '⚠️',
    success: '✓',
    info: 'ℹ️',
  }[msg.type]

  return (
    <div
      role="alert"
      className={`fixed bottom-20 left-1/2 z-[9999] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border p-4 shadow-xl md:bottom-6 ${bg} text-white`}
    >
      <div className="flex gap-3">
        <span className="shrink-0 text-xl">{icon}</span>
        <div className="min-w-0 flex-1">
          {msg.title && <p className="mb-0.5 text-sm font-bold">{msg.title}</p>}
          <p className="text-sm leading-relaxed">{msg.message}</p>
          {msg.suggestion && (
            <p className="mt-2 text-xs opacity-90">{msg.suggestion}</p>
          )}
          {!msg.suggestion &&
            (msg.maxAffordablePrice != null || msg.maxBidAmount != null) && (
              <p className="mt-1 text-xs font-medium">
                {msg.maxAffordablePrice != null &&
                  `建议选择价格 ≤ ${msg.maxAffordablePrice} 的宝可梦`}
                {msg.maxBidAmount != null &&
                  msg.maxAffordablePrice == null &&
                  `建议出价不超过 ${msg.maxBidAmount}`}
              </p>
            )}
        </div>
      </div>
    </div>
  )
}
