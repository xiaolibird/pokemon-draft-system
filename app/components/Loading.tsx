export function Loading({
  fullScreen = true,
  text = '加载中...',
}: {
  fullScreen?: boolean
  text?: string
}) {
  const content = (
    <div className="animate-in fade-in flex flex-col items-center justify-center gap-4 duration-500">
      <div className="relative">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500 dark:border-white/10"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500"></div>
        </div>
      </div>
      <p className="animate-pulse text-sm font-bold tracking-wide text-gray-500 dark:text-gray-400">
        {text}
      </p>
    </div>
  )

  if (fullScreen) {
    return (
      <div className="inset-0 z-50 flex min-h-screen items-center justify-center bg-gray-50 transition-colors dark:bg-gray-950">
        {content}
      </div>
    )
  }

  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      {content}
    </div>
  )
}
