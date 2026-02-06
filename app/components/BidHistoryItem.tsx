'use client'

import { getPokemonStaticIcon } from '@/app/lib/utils/helpers'

interface BidHistoryItemProps {
  action: any
  isHighestBid?: boolean
  maxBid?: number
  minBid?: number
}

export function BidHistoryItem({
  action,
  isHighestBid = false,
  maxBid = 100,
  minBid = 0,
}: BidHistoryItemProps) {
  const actor =
    action.details?.actorUsername || action.player?.username || '系统'
  const bidAmount = action.details?.bidAmount || 0
  const actionType = action.actionType
  const pokemonName = action.details?.pokemonName

  // Calculate percentage for HP bar (0-100%)
  const range = maxBid - minBid
  const percentage =
    range > 0
      ? Math.min(100, Math.max(0, ((bidAmount - minBid) / range) * 100))
      : 0

  // Theme configuration based on action type
  const getTheme = () => {
    switch (actionType) {
      case 'BID':
        return isHighestBid
          ? {
              name: '最高出价',
              color: 'amber',
              bgGradient:
                'bg-gradient-to-r from-yellow-300/80 via-amber-400/70 to-orange-400/80 dark:from-yellow-500/60 dark:via-amber-500/50 dark:to-orange-500/60',
              border: 'border-yellow-400/50 dark:border-yellow-500/50',
              text: 'text-amber-900 dark:text-amber-100',
              badge: 'text-amber-800 dark:text-amber-200/90',
              img: '/images/gholdengo-bg.webp',
              imgPos: 'left 20% top 15%',
            }
          : {
              name: '出价',
              color: 'blue',
              bgGradient:
                'bg-gradient-to-r from-blue-300/60 via-blue-400/50 to-indigo-400/60 dark:from-blue-600/40 dark:via-blue-500/30 dark:to-indigo-500/40',
              border: 'border-blue-300/30 dark:border-blue-500/30',
              text: 'text-blue-900 dark:text-blue-100',
              badge: 'text-blue-800 dark:text-blue-200/80',
              img: '/images/999Gimmighoul.webp',
              imgPos: 'left 80% top 30%',
            }
      case 'PICK':
        return {
          name: '获得',
          color: 'emerald',
          bgGradient:
            'bg-gradient-to-r from-emerald-300/60 via-teal-400/50 to-cyan-400/60 dark:from-emerald-600/40 dark:via-teal-500/30 dark:to-cyan-500/40',
          border: 'border-emerald-300/30 dark:border-emerald-500/30',
          text: 'text-emerald-900 dark:text-emerald-100',
          badge: 'text-emerald-800 dark:text-emerald-200/80',
          mainText: pokemonName,
        }
      case 'NOMINATE':
        return {
          name: '提名',
          color: 'indigo',
          bgGradient:
            'bg-gradient-to-r from-indigo-300/50 via-indigo-400/40 to-violet-400/50 dark:from-indigo-600/30 dark:via-indigo-700/20 dark:to-violet-700/30',
          border:
            'border-indigo-300/40 dark:border-indigo-600/40 shadow-indigo-500/5',
          text: 'text-indigo-900 dark:text-indigo-100',
          badge:
            'text-indigo-800 bg-white/40 dark:text-indigo-200/80 dark:bg-black/30',
          mainText: pokemonName,
        }
      case 'ADMIN_UNDO':
        return {
          name: '撤销',
          color: 'rose',
          bgGradient:
            'bg-gradient-to-r from-rose-300/50 via-pink-400/40 to-red-400/50 dark:from-rose-600/30 dark:via-pink-600/20 dark:to-red-700/30',
          border:
            'border-rose-300/40 dark:border-rose-600/40 shadow-rose-500/5',
          text: 'text-rose-900 dark:text-rose-100',
          badge:
            'text-rose-800 bg-white/40 dark:text-rose-200/80 dark:bg-black/30',
          mainText: pokemonName || '上一步',
        }
      default:
        let defaultName = '系统'
        if (actionType === 'ADMIN_PAUSE') defaultName = '暂停比赛'
        if (actionType === 'ADMIN_RESUME') defaultName = '恢复比赛'
        if (actionType === 'ADMIN_SKIP') defaultName = `跳过选手`
        if (actionType === 'NOMINATE_SKIP') defaultName = '超时跳过'

        return {
          name: defaultName,
          color: 'gray',
          bgGradient:
            'bg-gradient-to-r from-gray-300/40 via-slate-400/30 to-gray-400/40 dark:from-gray-600/30 dark:via-slate-500/20 dark:to-gray-500/30',
          border: 'border-gray-300/30 dark:border-gray-500/30',
          text: 'text-slate-900 dark:text-slate-100',
          badge:
            'text-slate-800 bg-white/40 dark:text-slate-200/80 dark:bg-black/30',
          mainText:
            actionType === 'ADMIN_SKIP'
              ? action.details?.skippedUsername || '当前玩家'
              : '',
        }
    }
  }

  const theme = getTheme()

  return (
    <div
      className={`relative min-h-[70px] overflow-hidden rounded-lg border text-sm transition-all duration-300 ${theme.border} bg-gray-50 dark:bg-gray-900/50`}
    >
      {/* 1. Background Image / Decoration (Bottom Layer) */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-lg">
        {theme.img ? (
          <div
            className="absolute inset-0 bg-no-repeat transition-transform duration-700"
            style={{
              backgroundImage: `url('${theme.img}')`,
              backgroundSize: 'cover',
              backgroundPosition: theme.imgPos,
              maskImage:
                'radial-gradient(circle at center, black 40%, transparent 100%)',
              WebkitMaskImage:
                'radial-gradient(circle at center, black 40%, transparent 100%)',
              opacity: 0.85,
              transform: 'scale(1.2)',
            }}
          />
        ) : (
          (actionType === 'PICK' ||
            actionType === 'NOMINATE' ||
            actionType === 'ADMIN_UNDO') && (
            <div className="absolute right-[-10%] bottom-[-20%] -rotate-12 transform opacity-20 blur-[1px] dark:opacity-30">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/20 dark:bg-black/20">
                <svg
                  className="h-16 w-16"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
                  <circle cx="12" cy="12" r="3" />
                  <path d="M22 12h-4c0-3.31-2.69-6-6-6s-6 2.69-6 6H2c0 5.52 4.48 10 10 10s10-4.48 10-10z" />
                </svg>
              </div>
            </div>
          )
        )}
      </div>

      {/* 2. Background HP Bar / Progress Bar (Middle Layer, shows on top of image) */}
      <div className="absolute inset-0 z-[1] flex">
        <div
          className={`transition-all duration-500 ${theme.bgGradient}`}
          style={{
            width: actionType === 'BID' ? `${percentage}%` : '100%',
            clipPath:
              actionType === 'BID'
                ? 'polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%)'
                : 'none',
          }}
        />
        {/* Unfilled part is transparent so image shows through */}
        {actionType === 'BID' && <div className="flex-1" />}
      </div>

      {/* Content */}
      <div className="relative z-10 flex min-h-[70px] flex-col justify-between p-3">
        {/* Header */}
        <div className="mb-1 flex items-center justify-between">
          <span
            className={`rounded bg-white/20 px-2 py-0.5 text-xs font-bold shadow-sm backdrop-blur-md dark:bg-black/20 ${theme.text} drop-shadow-sm`}
          >
            {actor}
          </span>
          <span
            className={`rounded bg-white/20 px-2 py-0.5 text-[10px] shadow-sm backdrop-blur-md dark:bg-black/20 ${theme.badge}`}
          >
            {new Date(action.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        {/* Main Action Text / Details */}
        <div className="mt-1 flex items-baseline justify-between">
          <span
            className={`rounded bg-white/20 px-2 py-0.5 text-xs font-medium shadow-sm backdrop-blur-md dark:bg-black/20 ${theme.badge}`}
          >
            {theme.name}
          </span>
          {actionType === 'BID' ? (
            <span
              className={`rounded bg-white/20 px-2 py-0.5 font-mono font-black shadow-sm backdrop-blur-md dark:bg-black/20 ${isHighestBid ? 'text-2xl' : 'text-xl'} ${theme.text} drop-shadow-sm`}
            >
              {bidAmount} G
            </span>
          ) : theme.mainText ? (
            <span
              className={`rounded bg-white/20 px-2 py-0.5 text-base font-bold shadow-sm backdrop-blur-md dark:bg-black/20 ${theme.text} max-w-[150px] truncate drop-shadow-sm`}
            >
              {theme.mainText}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
