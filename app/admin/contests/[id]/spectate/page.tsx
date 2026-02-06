'use client'

import ThemeToggle from '@/app/components/ThemeToggle'
import { apiFetch } from '@/app/lib/api/fetch'
import { useContestStream } from '@/app/lib/hooks/useContestStream'
import { useParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

// Components
import { AuctionPanel } from '@/app/components/AuctionPanel'
import { BidHistoryItem } from '@/app/components/BidHistoryItem'
import { Header, HomeButton } from '@/app/components/Header'
import { HeaderButton } from '@/app/components/HeaderButton'
import { PlayerSidebar } from '@/app/components/PlayerSidebar'
import { PokemonPool } from '@/app/components/PokemonPool'

export default function AdminSpectate() {
  const params = useParams()
  const contestId = typeof params.id === 'string' ? params.id : params.id?.[0]

  // State
  const [finalizing, setFinalizing] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [activeMobileTab, setActiveMobileTab] = useState<
    'left' | 'center' | 'right'
  >('center')

  // Data Hook
  const { data, refetch } = useContestStream({
    contestId: contestId || '',
    enabled: !!contestId,
    onError: (err) => {
      console.error(err)
    },
  })

  const contest = data?.contest
  const players = data?.players || []
  const pokemonPool = data?.pokemonPool || []
  const [draftHistory, setDraftHistory] = useState<any[]>([])

  // Load History separately
  // Load History with Throttle
  const lastHistoryFetchAt = useRef(0)
  const lastHistoryKeyRef = useRef<string | null>(null)
  const HISTORY_FETCH_THROTTLE_MS = 2500

  useEffect(() => {
    if (!contestId || !contest) return

    const key = `${contest.currentTurn}-${contest.auctionPhase}-${contest.activePokemonId ?? ''}`
    const now = Date.now()
    const shouldFetch =
      lastHistoryKeyRef.current !== key ||
      now - lastHistoryFetchAt.current >= HISTORY_FETCH_THROTTLE_MS

    if (!shouldFetch) return

    lastHistoryKeyRef.current = key
    lastHistoryFetchAt.current = now

    apiFetch(`/api/admin/contests/${contestId}/history`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setDraftHistory)
      .catch(console.error)
  }, [contestId, contest]) // Re-run when contest state changes (controlled by internal logic)

  // Timer Logic (Read-only for admin)
  useEffect(() => {
    if (contest?.bidEndTime && contest.auctionPhase === 'BIDDING') {
      const timer = setInterval(() => {
        const diff = new Date(contest.bidEndTime).getTime() - Date.now()
        setTimeLeft(diff)
      }, 200)
      return () => clearInterval(timer)
    } else {
      setTimeLeft(null)
    }
  }, [contest?.bidEndTime, contest?.auctionPhase])

  // Admin Controls
  const handleControl = async (action: string) => {
    if (!confirm(`确定要执行 ${action} 吗？`)) return
    try {
      const res = await apiFetch(`/api/admin/contests/${contestId}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) refetch()
    } catch {
      alert('操作失败')
    }
  }

  const handleFinalize = async () => {
    if (finalizing) return
    if (!confirm('确定要结束当前竞拍吗？')) return
    setFinalizing(true)
    try {
      await apiFetch(`/api/admin/contests/${contestId}/control`, {
        method: 'POST',
        body: JSON.stringify({ action: 'finalize' }),
      })
      refetch()
    } finally {
      setFinalizing(false)
    }
  }

  if (!contest)
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
        加载中...
      </div>
    )

  const activePokemon = contest.activePokemonId
    ? pokemonPool.find((p) => p.id === contest.activePokemonId)
    : null

  // Derived dummy states for read-only AuctionPanel
  const dummySetBid = () => {}

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-white">
      <Header
        variant="admin"
        transparent={true}
        className="flex-shrink-0"
        title={
          <div className="flex min-w-0 flex-col">
            <h1 className="text-lg leading-tight font-black break-words md:text-xl">
              {contest.name}
            </h1>
            <div className="text-[10px] text-gray-500 md:text-xs">
              状态: {contest.status} | 轮次: {contest.currentTurn + 1}
            </div>
          </div>
        }
        leftSlot={<HomeButton href="/admin/dashboard" />}
        rightSlot={
          <>
            <div className="flex gap-1 md:gap-2">
              {contest.status !== 'COMPLETED' && (
                <>
                  {contest.status === 'ACTIVE' && (
                    <HeaderButton
                      onClick={() => handleControl('pause')}
                      variant="warning"
                      size="sm"
                      icon={
                        <svg
                          className="h-3 w-3 md:h-4 md:w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      }
                    >
                      <span className="hidden md:inline">暂停</span>
                    </HeaderButton>
                  )}
                  {contest.status === 'PAUSED' && (
                    <HeaderButton
                      onClick={() => handleControl('resume')}
                      variant="success"
                      size="sm"
                      icon={
                        <svg
                          className="h-3 w-3 md:h-4 md:w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      }
                    >
                      <span className="hidden md:inline">继续</span>
                    </HeaderButton>
                  )}
                  <HeaderButton
                    onClick={() => handleControl('undo')}
                    variant="danger"
                    size="sm"
                    icon={
                      <svg
                        className="h-3 w-3 md:h-4 md:w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                        />
                      </svg>
                    }
                  >
                    <span className="hidden md:inline">撤销</span>
                  </HeaderButton>
                  <HeaderButton
                    onClick={() => handleControl('skip')}
                    variant="secondary"
                    size="sm"
                    icon={
                      <svg
                        className="h-3 w-3 md:h-4 md:w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                    }
                  >
                    <span className="hidden md:inline">跳过</span>
                  </HeaderButton>

                  {contest.draftMode === 'AUCTION' &&
                    contest.auctionPhase === 'BIDDING' && (
                      <>
                        {(!contest.auctionBidDuration ||
                          contest.auctionBidDuration === 0) && (
                          <span className="mr-2 text-xs font-bold text-amber-500">
                            (手动模式)
                          </span>
                        )}
                        <HeaderButton
                          onClick={handleFinalize}
                          disabled={finalizing}
                          variant="success"
                          size="sm"
                          icon={
                            <svg
                              className="h-3 w-3 md:h-4 md:w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                          }
                        >
                          <span className="hidden md:inline">强制成交</span>
                        </HeaderButton>
                      </>
                    )}
                </>
              )}
            </div>
            <ThemeToggle />
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Left: Players */}
        <div
          className={`${activeMobileTab === 'left' ? 'flex md:block' : 'hidden md:block'} z-10 min-h-0 w-full flex-1 flex-shrink-0 overflow-y-auto border-r border-gray-200 md:w-80 md:flex-none dark:border-white/5`}
        >
          <PlayerSidebar
            players={players}
            currentPlayerId={null}
            contest={contest}
            maxPokemon={contest.maxPokemonPerPlayer}
          />
        </div>

        {/* Center: Pool & Auction */}
        <main
          className={`${activeMobileTab === 'center' ? 'flex md:flex' : 'hidden md:flex'} relative min-w-0 flex-1 flex-col overflow-hidden`}
        >
          {/* Auction Panel Display (Read Only) */}
          {contest.draftMode === 'AUCTION' &&
            contest.auctionPhase === 'BIDDING' &&
            activePokemon && (
              <div className="p-4 pb-0 md:p-6">
                <AuctionPanel
                  contest={contest}
                  activePokemon={activePokemon}
                  timeLeft={timeLeft}
                  bidAmount={contest.highestBid || 0}
                  setBidAmount={dummySetBid}
                  onBid={dummySetBid}
                  isSubmitting={false}
                  playerId={null}
                  isSpectator={true}
                />
              </div>
            )}

          <div className="flex flex-1 flex-col overflow-hidden p-4 md:p-6">
            <PokemonPool
              pool={pokemonPool}
              contest={contest}
              myPokemonCount={0}
              isMyTurn={false}
              onAction={() => {}} // No action for admin spectate
              className="flex-1"
            />
          </div>
        </main>

        {/* Right: History */}
        <div
          className={`${activeMobileTab === 'right' ? 'flex flex-col md:block' : 'hidden md:block'} w-full overflow-y-auto border-l border-gray-200 bg-white p-4 md:w-72 dark:border-white/5 dark:bg-gray-950`}
        >
          <h3 className="mb-4 text-xs font-black tracking-widest text-gray-500 uppercase">
            实时动态
          </h3>
          <div className="space-y-2">
            {(() => {
              // Calculate min/max bid for HP bar visualization
              const bidActions = draftHistory.filter(
                (a: any) => a.actionType === 'BID',
              )
              const bidAmounts = bidActions.map(
                (a: any) => a.details?.bidAmount || 0,
              )
              const maxBid =
                bidAmounts.length > 0 ? Math.max(...bidAmounts) : 100
              const minBid = bidAmounts.length > 0 ? Math.min(...bidAmounts) : 0

              return draftHistory.map((action: any, idx: number) => {
                const isHighestBid =
                  action.actionType === 'BID' &&
                  action.details?.bidAmount === maxBid
                return (
                  <BidHistoryItem
                    key={idx}
                    action={action}
                    isHighestBid={isHighestBid}
                    maxBid={maxBid}
                    minBid={minBid}
                  />
                )
              })
            })()}
          </div>
        </div>
      </div>

      {/* Mobile Tab Bar */}
      <nav className="fixed right-0 bottom-0 left-0 z-[90] flex items-center justify-around border-t border-gray-200 bg-white/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden dark:border-white/10 dark:bg-gray-900/95">
        <button
          onClick={() => setActiveMobileTab('left')}
          className={`flex flex-1 flex-col items-center py-2 ${activeMobileTab === 'left' ? 'text-blue-500' : 'text-gray-500'}`}
        >
          <span className="text-[10px] font-black">顺位</span>
        </button>
        <button
          onClick={() => setActiveMobileTab('center')}
          className={`flex flex-1 flex-col items-center py-2 ${activeMobileTab === 'center' ? 'text-blue-500' : 'text-gray-500'}`}
        >
          <span className="text-[10px] font-black">宝可梦</span>
        </button>
        <button
          onClick={() => setActiveMobileTab('right')}
          className={`flex flex-1 flex-col items-center py-2 ${activeMobileTab === 'right' ? 'text-blue-500' : 'text-gray-500'}`}
        >
          <span className="text-[10px] font-black">竞价</span>
        </button>
      </nav>
    </div>
  )
}
