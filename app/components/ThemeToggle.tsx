'use client'

import { useTheme } from '@/app/lib/contexts/theme'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      className="rounded-xl bg-gray-100 p-1.5 text-gray-800 transition-colors hover:bg-gray-200 md:p-2 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
      title={`切换到${theme === 'dark' ? '日间' : '夜间'}模式`}
    >
      {theme === 'dark' ? (
        // Sun Icon for Dark Mode (click to switch to light)
        <svg
          className="h-4 w-4 md:h-5 md:w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ) : (
        // Moon Icon for Light Mode (click to switch to dark)
        <svg
          className="h-4 w-4 md:h-5 md:w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      )}
    </button>
  )
}
