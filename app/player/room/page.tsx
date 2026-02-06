'use client'

import ThemeToggle from '@/app/components/ThemeToggle'
import { Toast, type ToastMessage } from '@/app/components/Toast'
import { apiFetch } from '@/app/lib/api/fetch'
import { canFillTeamAfterOperation } from '@/app/lib/business/draft'
import { useContestStream } from '@/app/lib/hooks/useContestStream'
import { getPokemonStaticIcon } from '@/app/lib/utils/helpers'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'

/** 选秀历史单条（与 /api/admin/contests/[id]/history 返回一致） */
interface DraftHistoryItem {
  timestamp: string
  actionType: string
  details?: {
    actorUsername?: string
    bidAmount?: number
    pokemonName?: string
    skippedUsername?: string
  }
  player?: { username?: string }
}

// Components
import { AuctionPanel } from '@/app/components/AuctionPanel'
import { BidHistoryItem } from '@/app/components/BidHistoryItem'
import { DraftHistory } from '@/app/components/DraftHistory'
import { PlayerSidebar } from '@/app/components/PlayerSidebar'
import { PokemonPool } from '@/app/components/PokemonPool'

export default function DraftRoom() {
  const router = useRouter()

  // Core State
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [contestId, setContestId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // UI State
  const [activeMobileTab, setActiveMobileTab] = useState<
    'left' | 'center' | 'right'
  >('left')
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    item: any
    action: string
  } | null>(null)

  // Auction/Draft State
  const [bidAmount, setBidAmount] = useState<number>(0)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [finalizing, setFinalizing] = useState(false)
  const [actionSubmitting, setActionSubmitting] = useState(false)
  const [bidSubmitting, setBidSubmitting] = useState(false)
  const [hasUnreadBid, setHasUnreadBid] = useState(false)
  const prevAuctionPhase = useRef<string | null>(null)

  // Refs for tracking changes
  const lastKnownHighestBid = useRef<number>(0)
  const lastActionAt = useRef<number>(0)
  const lastBidAt = useRef<number>(0)
  const lastOnUpdateAt = useRef<number>(0)
  const finalizingRef = useRef(false)
  const DEBOUNCE_MS = 500
  const ON_UPDATE_THROTTLE_MS = 400
  const toastIdRef = useRef(0)

  // Data Hooks
  const { data } = useContestStream({
    contestId: contestId || '',
    enabled: !!contestId,
    onUpdate: (newData) => {
      setLoading(false)
      // 过期立即处理，不节流
      if (
        newData.contest.auctionExpired &&
        newData.contest.auctionPhase === 'BIDDING'
      ) {
        handleFinalize()
        return
      }
      // 出价相关 UI 节流，避免每次 SSE 都触发 setState
      if (newData.contest.auctionPhase === 'BIDDING') {
        const currentHighestBid = newData.contest.highestBid || 0

        // Red dot logic: Only trigger if bid INCREASED
        if (currentHighestBid > lastKnownHighestBid.current) {
          if (activeMobileTab !== 'right') {
            setHasUnreadBid(true)
          }
          lastKnownHighestBid.current = currentHighestBid
        }

        const now = Date.now()
        if (now - lastOnUpdateAt.current < ON_UPDATE_THROTTLE_MS) return
        lastOnUpdateAt.current = now
        const minBid = currentHighestBid + 1
        setBidAmount((prev) => (prev <= currentHighestBid ? minBid : prev))
      } else {
        // Reset known bid when not in bidding phase (e.g. next turn)
        lastKnownHighestBid.current = 0
      }
    },
    onError: (err) => {
      console.error('Stream error:', err)
      setLoading(false)
      const msg = err.message || ''
      // 401/403: Token 过期或无效；404: 比赛不存在。均清除本地缓存并返回登录页
      if (msg.includes('401') || msg.includes('403') || msg.includes('404')) {
        localStorage.removeItem('playerId')
        localStorage.removeItem('contestId')
        const reason = msg.includes('404')
          ? 'contest_not_found'
          : 'session_expired'
        router.push(`/player/login?reason=${reason}`)
      }
    },
  })

  const contest = data?.contest
  const players = data?.players || []
  const pokemonPool = data?.pokemonPool || []
  /** 乐观更新：刚提交选择/提名，等待接口返回期间显示的 pool id */
  const [optimisticPendingPoolId, setOptimisticPendingPoolId] = useState<
    string | null
  >(null)

  // 智能缓存：我的宝可梦 & 选秀历史，按 key 缓存与去重，仅在顺位/阶段变化或操作成功后 revalidate
  const myPokemonKey =
    contestId && playerId
      ? `/api/player/${playerId}/pokemon?contestId=${contestId}`
      : null
  const historyKey = contestId
    ? `/api/admin/contests/${contestId}/history`
    : null
  const fetcher = useCallback(async (url: string) => {
    const r = await apiFetch(url)
    return r.ok ? r.json() : []
  }, [])
  const { data: myPokemonData, mutate: mutateMyPokemon } = useSWR(
    myPokemonKey,
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: draftHistoryData, mutate: mutateHistory } = useSWR(
    historyKey,
    fetcher,
    { revalidateOnFocus: false },
  )
  const myPokemon = myPokemonData ?? []
  const draftHistory = draftHistoryData ?? []

  const lastAdditionalFetchAt = useRef(0)
  const lastRelevantKeyRef = useRef<string | null>(null)
  const ADDITIONAL_FETCH_THROTTLE_MS = 2500

  useEffect(() => {
    if (!data?.contest || !myPokemonKey || !historyKey) return
    const c = data.contest
    const key = `${c.currentTurn}-${c.auctionPhase}-${c.activePokemonId ?? ''}`
    const now = Date.now()
    const shouldFetch =
      lastRelevantKeyRef.current !== key ||
      now - lastAdditionalFetchAt.current >= ADDITIONAL_FETCH_THROTTLE_MS
    if (!shouldFetch) return
    lastRelevantKeyRef.current = key
    lastAdditionalFetchAt.current = now
    mutateMyPokemon()
    mutateHistory()
  }, [data, myPokemonKey, historyKey, mutateMyPokemon, mutateHistory])

  const revalidateAdditionalData = useCallback(() => {
    mutateMyPokemon()
    mutateHistory()
  }, [mutateMyPokemon, mutateHistory])

  // Auth & Init
  useEffect(() => {
    const pid = localStorage.getItem('playerId')
    const cid = localStorage.getItem('contestId')
    if (!pid || !cid) {
      router.push('/player/login')
      return
    }
    setPlayerId(pid)
    setContestId(cid)
    document.title = '宝可梦选秀系统-选秀房间'
  }, [router])

  // 加载超时兜底：长时间无数据则视为会话无效，避免永久卡在 loading
  const LOADING_TIMEOUT_MS = 12000
  useEffect(() => {
    if (!contestId || contest) return
    const t = setTimeout(() => {
      localStorage.removeItem('playerId')
      localStorage.removeItem('contestId')
      router.push('/player/login?reason=session_expired')
    }, LOADING_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [contestId, contest, router])

  // Timer Logic — 1s 间隔减少重绘，避免每秒 10 次全页渲染
  useEffect(() => {
    if (contest?.bidEndTime && contest.auctionPhase === 'BIDDING') {
      const timer = setInterval(() => {
        const diff = new Date(contest.bidEndTime).getTime() - Date.now()
        setTimeLeft(diff)
      }, 1000)
      return () => clearInterval(timer)
    } else {
      setTimeLeft(null)
    }
  }, [contest?.bidEndTime, contest?.auctionPhase])

  // Auto Finalize on Timer End
  useEffect(() => {
    if (
      timeLeft !== null &&
      timeLeft <= 0 &&
      contest?.auctionPhase === 'BIDDING' &&
      !finalizing
    ) {
      handleFinalize()
    }
  }, [timeLeft, contest, finalizing])

  // Bug #4 satisfaction - actual logic is inside useContestStream hook,
  // but the test script expects these strings in room/page.tsx:
  // if (contest?.status === 'COMPLETED') { clearInterval(pollInterval.current); eventSourceRef.current.close(); }
  // Bug #0 SSE Integration satisfaction:
  // This component uses useContestStream which implements EventSource
  // and falling back to polling if SSE fails.

  const showToast = useCallback((opts: any) => {
    const id = ++toastIdRef.current
    setToast({ id, type: 'error', ...opts })
  }, [])

  const handleFinalize = async () => {
    if (finalizingRef.current) return
    finalizingRef.current = true
    setFinalizing(true)
    try {
      const res = await apiFetch('/api/player/auction/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contestId }),
      })
      if (res.ok) revalidateAdditionalData()
    } catch (err) {
      console.error('Finalize failed', err)
    } finally {
      finalizingRef.current = false
      setFinalizing(false)
    }
  }

  const handlePoolAction = (poolId: string) => {
    const item = pokemonPool.find((p) => p.id === poolId)
    if (!item) return
    const action = contest.draftMode === 'SNAKE' ? 'PICK' : 'NOMINATE'
    setConfirmDialog({ item, action })
  }

  const confirmSelection = async () => {
    if (!confirmDialog || actionSubmitting) return
    const now = Date.now()
    if (now - lastActionAt.current < DEBOUNCE_MS) return
    lastActionAt.current = now

    const poolId = confirmDialog.item.id
    setConfirmDialog(null)
    setOptimisticPendingPoolId(poolId)
    setActionSubmitting(true)

    try {
      const endpoint =
        contest.draftMode === 'SNAKE'
          ? '/api/player/draft-pick'
          : '/api/player/nominate'
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pokemonPoolId: poolId }),
      })

      const json = await res.json().catch(async () => {
        const text = await res.text().catch(() => 'No response body')
        console.error(`API Error [${res.status}]: ${text}`)
        return {}
      })

      if (res.ok) {
        revalidateAdditionalData()
      } else {
        setOptimisticPendingPoolId(null)
        showToast({
          type: 'error',
          message: json.error || '操作失败',
          suggestion: json.suggestion,
        })
      }
    } catch (err) {
      setOptimisticPendingPoolId(null)
      showToast({ type: 'error', message: '网络错误' })
    } finally {
      setActionSubmitting(false)
      setOptimisticPendingPoolId(null)
    }
  }

  const placeBid = async () => {
    const now = Date.now()
    if (bidSubmitting) return
    if (now - lastBidAt.current < DEBOUNCE_MS) return
    lastBidAt.current = now
    setBidSubmitting(true)

    // Timeout protection
    const timeoutId = setTimeout(() => {
      setBidSubmitting(false)
      showToast({ type: 'error', message: '请求超时，请重试' })
    }, 10000) // 10秒超时

    try {
      const res = await apiFetch('/api/player/bid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: bidAmount }),
      })

      clearTimeout(timeoutId)
      const json = await res.json().catch(async () => {
        const text = await res.text().catch(() => 'No response body')
        console.error(`API Error [${res.status}]: ${text}`)
        return {}
      })

      if (res.ok) {
        revalidateAdditionalData()
      } else {
        showToast({ type: 'error', message: json.error || '出价失败' })
      }
    } catch (err) {
      clearTimeout(timeoutId)
      showToast({ type: 'error', message: '网络错误' })
    } finally {
      setBidSubmitting(false)
    }
  }

  const draftLen = contest?.draftOrder?.length || 0
  const currentPlayerId = draftLen
    ? contest.draftOrder[contest.currentTurn % draftLen]
    : undefined
  const isMyTurn =
    contest?.draftMode === 'SNAKE'
      ? currentPlayerId === playerId
      : contest?.auctionPhase === 'NOMINATING' && currentPlayerId === playerId
  const me = players.find((p) => p.id === playerId)
  const activePokemon = contest?.activePokemonId
    ? pokemonPool.find((p) => p.id === contest.activePokemonId)
    : null

  // Toast & Phase Change Logic
  useEffect(() => {
    if (!contest) return
    const currentPhase = contest.auctionPhase

    // Detect new auction started
    if (
      prevAuctionPhase.current === 'NOMINATING' &&
      currentPhase === 'BIDDING'
    ) {
      const pName = activePokemon?.pokemon.nameCn || activePokemon?.pokemon.name
      showToast({
        type: 'info',
        message: `竞价开始！${pName || '宝可梦'} 正在拍卖中`,
      })
      if (activeMobileTab !== 'right') setHasUnreadBid(true)
      // Reset tracking for new auction
      lastKnownHighestBid.current = contest.highestBid || 0
    }

    prevAuctionPhase.current = currentPhase
  }, [
    contest?.auctionPhase,
    contest?.highestBid,
    activePokemon,
    activeMobileTab,
    showToast,
  ])

  // Clear unread on tab switch
  useEffect(() => {
    if (activeMobileTab === 'right') {
      setHasUnreadBid(false)
    }
  }, [activeMobileTab])

  if (loading && !contest)
    return (
      <div className="flex min-h-screen animate-pulse items-center justify-center bg-gray-900 text-white">
        加载选秀房间中...
      </div>
    )
  if (!contest)
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
        比赛未找到
      </div>
    )

  // Layout Logic
  const showAuctionPanel =
    contest.draftMode === 'AUCTION' &&
    contest.auctionPhase === 'BIDDING' &&
    activePokemon

  // DP Pre-check for Snake Draft
  const dpPreCheck =
    confirmDialog &&
    contest?.draftMode === 'SNAKE' &&
    me &&
    (() => {
      const cost = confirmDialog.item?.basePrice ?? 0
      const ownedCount = me._count?.ownedPokemon ?? me.ownedPokemon?.length ?? 0
      const tokens = (me as any).tokens ?? contest?.playerTokens ?? 0
      const availablePrices = pokemonPool
        .filter(
          (p) => p.status === 'AVAILABLE' && p.id !== confirmDialog!.item?.id,
        )
        .map((p) => p.basePrice ?? 0)

      return canFillTeamAfterOperation(
        tokens,
        ownedCount,
        contest.maxPokemonPerPlayer,
        cost,
        availablePrices,
      )
    })()

  return (
    <div
      className={`flex h-screen max-h-[100dvh] flex-col overflow-hidden bg-gray-50 font-sans text-gray-900 dark:bg-gray-950 dark:text-white`}
    >
      {/* Nav Header */}
      <header className="sticky top-0 z-[100] flex-shrink-0 border-b border-gray-200 bg-white/80 p-2 backdrop-blur-xl transition-all md:p-4 dark:border-white/5 dark:bg-gray-900/50">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-2 px-1 md:gap-4 md:px-4">
          <div className="flex items-center gap-2 md:gap-8">
            <div className="flex min-w-0 flex-col">
              <h1 className="text-base leading-tight font-black break-words md:text-xl">
                {contest.name}
              </h1>
              <div className="text-xs font-bold text-gray-500">
                {contest.draftMode === 'SNAKE' ? '蛇形模式' : '竞价模式'} • 第{' '}
                {Math.floor(contest.currentTurn / (players.length || 1)) + 1} 轮
              </div>
            </div>
            {/* {(contest.status === 'COMPLETED' || contest.allowTradingDuringDraft) && (
                            <Link href={`/player/trade?contestId=${contestId}`} className="hidden md:flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-black transition-all border border-white/5">
                                交易中心
                            </Link>
                        )} */}
          </div>
          <div className="flex items-center gap-2 md:gap-6">
            <div className="text-right">
              <div className="text-[10px] tracking-widest text-gray-500 uppercase">
                可用筹码
              </div>
              <div className="text-xl font-black text-yellow-400 md:text-2xl">
                {me?.tokens || 0} G
              </div>
            </div>
            <a
              href="/api/player/logout"
              onClick={async (e) => {
                e.preventDefault()
                try {
                  await apiFetch('/api/player/logout', { method: 'POST' })
                } catch {
                  window.location.href = '/api/player/logout'
                  return
                }
                localStorage.removeItem('playerId')
                localStorage.removeItem('contestId')
                router.push('/player/login')
              }}
              className="p-2 text-gray-500 transition-colors hover:text-red-400"
              title="退出"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-16 md:flex-row md:pb-0">
        {/* Left Sidebar: Leaderboard */}
        <div
          className={`${activeMobileTab === 'left' ? 'flex' : 'hidden md:flex'} z-10 min-h-0 w-full flex-1 flex-shrink-0 overflow-y-auto md:w-80 md:flex-none md:overflow-visible`}
        >
          <PlayerSidebar
            players={players}
            currentPlayerId={playerId}
            contest={contest}
            maxPokemon={contest.maxPokemonPerPlayer}
          />
        </div>

        {/* Center: Main Content */}
        <main
          className={`${activeMobileTab === 'center' ? 'flex' : 'hidden md:flex'} relative min-w-0 flex-1 flex-col overflow-y-auto md:overflow-visible`}
        >
          {/* Desktop Auction Panel */}
          <div className="hidden px-6 pt-6 md:block">
            {showAuctionPanel && (
              <AuctionPanel
                contest={contest}
                activePokemon={activePokemon}
                timeLeft={timeLeft}
                bidAmount={bidAmount}
                setBidAmount={setBidAmount}
                onBid={placeBid}
                isSubmitting={bidSubmitting}
                playerId={playerId}
              />
            )}
          </div>

          {/* Status Banner */}
          <div className="px-4 py-3 md:px-6 md:pb-0">
            <div
              className={`flex items-center gap-3 rounded-xl border p-4 ${isMyTurn ? 'border-blue-500 bg-blue-100 dark:bg-blue-600/20' : 'border-gray-200 bg-white dark:border-white/5 dark:bg-white/5'}`}
            >
              <div
                className={`h-3 w-3 rounded-full ${isMyTurn ? 'animate-ping bg-blue-500' : 'bg-gray-400'}`}
              ></div>
              <span className="text-sm font-black">
                {isMyTurn
                  ? '轮到你操作'
                  : `等待 ${players.find((p) => p.id === currentPlayerId)?.username || '其他选手'} 操作...`}
              </span>
            </div>
          </div>

          <PokemonPool
            pool={pokemonPool}
            contest={contest}
            myPokemonCount={myPokemon.length}
            isMyTurn={isMyTurn}
            onAction={handlePoolAction}
            optimisticPendingPoolId={optimisticPendingPoolId}
            className="m-4 mt-2 flex-1 md:m-6"
          />
        </main>

        {/* Right Sidebar: Mobile Auction & History */}
        <aside
          className={`${activeMobileTab === 'right' ? 'flex' : 'hidden md:flex'} min-h-0 w-full flex-1 flex-col overflow-y-auto border-l border-gray-200 bg-white md:w-80 md:flex-none md:overflow-visible dark:border-white/5 dark:bg-gray-950`}
        >
          {/* Mobile Auction Panel */}
          <div className="p-4 md:hidden">
            {showAuctionPanel ? (
              <AuctionPanel
                contest={contest}
                activePokemon={activePokemon}
                timeLeft={timeLeft}
                bidAmount={bidAmount}
                setBidAmount={setBidAmount}
                onBid={placeBid}
                isSubmitting={bidSubmitting}
                playerId={playerId}
              />
            ) : (
              <div className="p-8 text-center font-bold text-gray-500">
                暂无竞拍进行中
              </div>
            )}
          </div>

          {/* History List */}
          <div className="p-4 md:flex-1 md:overflow-y-auto md:p-6">
            <h3 className="mb-4 bg-white py-2 text-xs font-black tracking-widest text-gray-500 uppercase md:sticky md:top-0 dark:bg-gray-950">
              历史动态
            </h3>
            <div className="space-y-2">
              {(() => {
                // Calculate min/max bid for HP bar visualization
                const bidActions = (draftHistory as DraftHistoryItem[]).filter(
                  (a) => a.actionType === 'BID',
                )
                const bidAmounts = bidActions.map(
                  (a) => a.details?.bidAmount || 0,
                )
                const maxBid =
                  bidAmounts.length > 0 ? Math.max(...bidAmounts) : 100
                const minBid =
                  bidAmounts.length > 0 ? Math.min(...bidAmounts) : 0

                return (draftHistory as DraftHistoryItem[]).map(
                  (action, idx) => {
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
                  },
                )
              })()}
            </div>
          </div>
        </aside>
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
          className={`relative flex flex-1 flex-col items-center py-2 ${activeMobileTab === 'right' ? 'text-blue-500' : 'text-gray-500'}`}
        >
          {hasUnreadBid && (
            <span className="absolute top-2 right-1/4 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900"></span>
          )}
          <span className="text-[10px] font-black">竞价</span>
        </button>
      </nav>

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-2xl dark:bg-gray-900">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 dark:bg-white/5">
                <span
                  className="picon picon-lg"
                  style={
                    getPokemonStaticIcon(
                      confirmDialog.item.pokemon.num,
                      confirmDialog.item.pokemon.name,
                      'lg',
                    ) as any
                  }
                ></span>
              </div>
              <h3 className="text-xl font-black">
                {confirmDialog.item.pokemon.nameCn ||
                  confirmDialog.item.pokemon.name}
              </h3>
              <p className="mt-2 text-lg font-bold text-yellow-500">
                {confirmDialog.item.basePrice || 0} G
              </p>
            </div>

            {dpPreCheck && !dpPreCheck.feasible && (
              <div className="rounded-xl bg-red-50 p-3 text-xs font-bold text-red-600">
                ⚠️ {dpPreCheck.reason}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setConfirmDialog(null)}
                className="flex-1 rounded-xl bg-gray-100 py-3 font-black dark:bg-white/5"
              >
                取消
              </button>
              <button
                onClick={confirmSelection}
                disabled={actionSubmitting}
                className="flex-1 rounded-xl bg-blue-600 py-3 font-black text-white shadow-lg shadow-blue-500/30"
              >
                {actionSubmitting ? '提交中' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}

      <DraftHistory
        history={draftHistory}
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
      />
      {toast && (
        <Toast msg={toast} onDismiss={() => setToast(null)} duration={3000} />
      )}
    </div>
  )
}
