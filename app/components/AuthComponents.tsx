import Link from 'next/link'
import { ComponentProps } from 'react'

interface AuthInputProps extends ComponentProps<'input'> {
  label?: string
}

export function AuthInput({ className, ...props }: AuthInputProps) {
  return (
    <input
      className={`w-full rounded-3xl border border-white/10 bg-black/20 px-8 py-5 text-lg font-bold text-white placeholder-slate-500 transition-all focus:bg-black/30 focus:ring-4 focus:outline-none ${className}`}
      {...props}
    />
  )
}

interface AuthButtonProps extends ComponentProps<'button'> {
  isLoading?: boolean
  loadingText?: string
  gradient?: 'brand' | 'blue' | 'emerald' | 'blue-indigo' | 'emerald-reverse'
}

export function AuthButton({
  children,
  isLoading,
  loadingText,
  gradient = 'brand',
  className,
  disabled,
  ...props
}: AuthButtonProps) {
  const gradientStyles = {
    brand:
      'from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 shadow-blue-900/40', // Unified Brand
    blue: 'from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-900/40',
    'blue-indigo':
      'from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-900/40',
    emerald:
      'from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 shadow-blue-900/40',
    'emerald-reverse':
      'from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 shadow-emerald-900/40',
  }

  const baseGradient =
    gradientStyles[gradient as keyof typeof gradientStyles] ||
    gradientStyles.brand

  return (
    <button
      disabled={isLoading || disabled}
      className={`w-full bg-gradient-to-r py-5 ${baseGradient} transform rounded-3xl text-lg font-black text-white shadow-xl transition hover:-translate-y-1 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {isLoading ? loadingText : children}
    </button>
  )
}

export function BackButton() {
  return (
    <div className="mb-8 flex justify-center">
      <Link
        href="/"
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-400 transition hover:bg-white/10 hover:text-white"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M10 19l-7-7m0 0l7-7m-7 7h18"
          />
        </svg>
        返回首页
      </Link>
    </div>
  )
}
