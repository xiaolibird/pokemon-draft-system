/**
 * PlayerSidebar Component
 *
 * Displays player rankings and their Pokemon teams
 */

'use client'

import { getPokemonStaticIcon } from '@/app/lib/utils/helpers'
import { memo } from 'react'

interface Player {
  id: string
  username: string
  tokens: number
  ownedPokemon?: any[]
  lastSeenAt?: string | Date | null
}

interface PlayerSidebarProps {
  players: Player[]
  currentPlayerId: string | null
  contest: any
  maxPokemon: number
}

function playerSidebarPropsEqual(
  prev: PlayerSidebarProps,
  next: PlayerSidebarProps,
): boolean {
  if (prev.currentPlayerId !== next.currentPlayerId) return false
  if (prev.maxPokemon !== next.maxPokemon) return false
  if (prev.players !== next.players) return false
  const pc = prev.contest || {}
  const nc = next.contest || {}
  if ((pc.draftOrder as any) !== (nc.draftOrder as any)) return false
  if (pc.currentTurn !== nc.currentTurn) return false
  if (pc.highestBidderId !== nc.highestBidderId) return false
  return true
}

const PlayerSidebarInner = function PlayerSidebar({
  players,
  currentPlayerId,
  contest,
  maxPokemon,
}: PlayerSidebarProps) {
  // Sort players by draft order
  const orderedPlayers = (() => {
    const draftOrder = contest?.draftOrder as string[] | undefined
    if (!draftOrder?.length) return players

    const seen = new Set<string>()
    const order: string[] = []
    for (const pid of draftOrder) {
      if (!seen.has(pid)) {
        seen.add(pid)
        order.push(pid)
      }
    }

    const byId = new Map(players.map((p) => [p.id, p]))
    const result = order.map((pid) => byId.get(pid)).filter(Boolean) as Player[]

    // Add any players not in draft order
    for (const p of players) {
      if (!seen.has(p.id)) result.push(p)
    }

    return result
  })()

  const getCurrentTurnPlayerId = () => {
    if (!contest?.draftOrder || contest.currentTurn === undefined) return null
    const len = contest.draftOrder.length
    return len ? contest.draftOrder[contest.currentTurn % len] : null
  }

  const currentTurnPlayerId = getCurrentTurnPlayerId()
  const highestBidderId = contest?.highestBidderId

  const isOnline = (lastSeenAt: string | Date | null | undefined) => {
    if (!lastSeenAt) return false
    const diff = new Date().getTime() - new Date(lastSeenAt).getTime()
    return diff < 60000 // < 1 minute
  }

  const getLastSeenText = (lastSeenAt: string | Date | null | undefined) => {
    if (!lastSeenAt) return '离线'
    const date = new Date(lastSeenAt)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    if (diff < 60000) return '在线'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前活跃`
    return '离线'
  }

  return (
    <aside className="flex w-full flex-col border-b border-gray-200 bg-white md:w-64 md:overflow-hidden md:border-r md:border-b-0 lg:w-72 dark:border-white/5 dark:bg-gray-900">
      <div className="border-b border-gray-200 p-4 dark:border-white/5">
        <h2 className="flex items-center gap-2 text-lg font-black text-gray-900 dark:text-white">
          <svg
            className="h-5 w-5 text-blue-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          选手顺位
        </h2>
      </div>

      <div className="space-y-2 p-3 md:flex-1 md:overflow-y-auto">
        {orderedPlayers.map((player, idx) => {
          const isMe = player.id === currentPlayerId
          const isCurrentTurn = player.id === currentTurnPlayerId
          const isHighestBidder = player.id === highestBidderId
          const isBoth = isCurrentTurn && isHighestBidder

          return (
            <div
              key={player.id}
              className={`rounded-xl border-2 p-3 transition-all ${
                isBoth
                  ? 'border-blue-500 bg-gradient-to-br from-amber-100 via-yellow-50 to-white shadow-lg dark:from-amber-900/50 dark:via-yellow-900/30 dark:to-white/10'
                  : isCurrentTurn
                    ? 'border-blue-500 bg-white shadow-md dark:bg-gray-900'
                    : isHighestBidder
                      ? 'border-amber-400/60 bg-gradient-to-br from-amber-100 via-yellow-50 to-white shadow-md dark:from-amber-900/50 dark:via-yellow-900/30 dark:to-white/10'
                      : isMe
                        ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
                        : 'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50'
              } `}
            >
              {/* Player Header */}
              <div className="mb-2 flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex-shrink-0 text-xs font-bold text-gray-500 dark:text-gray-400">
                    #{idx + 1}
                  </span>
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      isOnline(player.lastSeenAt)
                        ? 'bg-green-500'
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                    title={getLastSeenText(player.lastSeenAt)}
                  />
                  <span
                    className={`truncate text-sm font-black ${isMe ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}
                  >
                    {player.username}
                    {isMe && <span className="ml-1 text-xs">(你)</span>}
                  </span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  {isCurrentTurn && (
                    <span className="text-xs text-blue-500">🎯</span>
                  )}
                  {isHighestBidder && (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      👑
                    </span>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-mono font-bold text-yellow-600 dark:text-yellow-500">
                  {player.tokens} G
                </span>
                <span className="text-gray-600 dark:text-gray-400">
                  {player.ownedPokemon?.length || 0}/{maxPokemon}
                </span>
              </div>

              {/* Pokemon Icons */}
              {player.ownedPokemon && player.ownedPokemon.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {player.ownedPokemon.slice(0, 6).map((owned: any) => (
                    <span
                      key={owned.id}
                      className="picon picon-sm"
                      style={
                        typeof getPokemonStaticIcon(
                          owned.pokemon.num,
                          owned.pokemon.name,
                          'sm',
                        ) === 'object'
                          ? (getPokemonStaticIcon(
                              owned.pokemon.num,
                              owned.pokemon.name,
                              'sm',
                            ) as any)
                          : {}
                      }
                      title={owned.pokemon.nameCn || owned.pokemon.name}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

export const PlayerSidebar = memo(PlayerSidebarInner, playerSidebarPropsEqual)
