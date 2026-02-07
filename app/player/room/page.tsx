"use client";

import ThemeToggle from "@/app/components/ThemeToggle";
import { Toast, type ToastMessage } from "@/app/components/Toast";
import { apiFetch } from "@/app/lib/api/fetch";
import { canFillTeamAfterOperation } from "@/app/lib/business/draft";
import { useContestStream } from "@/app/lib/hooks/useContestStream";
import { useDraftTimer } from "@/app/lib/hooks/useDraftTimer";
import { useDraftActions } from "@/app/lib/hooks/useDraftActions";
import { getPokemonStaticIcon } from "@/app/lib/utils/helpers";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { DraftHistoryItem } from "@/app/types/draft";

// Components
import { AuctionPanel } from "@/app/components/AuctionPanel";
import { BidHistoryItem } from "@/app/components/BidHistoryItem";
import { DraftHistory } from "@/app/components/DraftHistory";
import { PlayerSidebar } from "@/app/components/PlayerSidebar";
import { PokemonPool } from "@/app/components/PokemonPool";

export default function DraftRoom() {
  const router = useRouter();

  // Core Auth State
  const [playerId] = useState<string | null>(() => {
    if (typeof window !== "undefined") return localStorage.getItem("playerId");
    return null;
  });
  const [contestId] = useState<string | null>(() => {
    if (typeof window !== "undefined") return localStorage.getItem("contestId");
    return null;
  });
  const [loading, setLoading] = useState(true);

  // UI State
  const [activeMobileTab, setActiveMobileTab] = useState<
    "left" | "center" | "right"
  >("left");
  const handleTabChange = (tab: "left" | "center" | "right") => {
    setActiveMobileTab(tab);
    if (tab === "right") setHasUnreadBid(false);
  };
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    item: any;
    action: string;
  } | null>(null);

  // Sub-component States managed here
  const [bidAmount, setBidAmount] = useState<number>(0);
  const [hasUnreadBid, setHasUnreadBid] = useState(false);
  const prevAuctionPhase = useRef<string | null>(null);

  // Helper Refs
  const lastKnownHighestBid = useRef<number>(0);
  const lastOnUpdateAt = useRef<number>(0);
  const ON_UPDATE_THROTTLE_MS = 400;
  const toastIdRef = useRef(0);

  const showToast = useCallback(
    (opts: any) => {
      const id = ++toastIdRef.current;
      setToast({ id, type: "error", ...opts }); // opts 中的 type 会覆盖默认的 "error"
    },
    [setToast],
  );

  // Data Hooks
  const { data } = useContestStream({
    contestId: contestId || "",
    enabled: !!contestId,
    onUpdate: (newData) => {
      setLoading(false);
      // SSE update processing
      if (newData.contest.auctionPhase === "BIDDING") {
        const currentHighestBid = newData.contest.highestBid || 0;
        if (currentHighestBid > lastKnownHighestBid.current) {
          if (activeMobileTab !== "right") setHasUnreadBid(true);
          lastKnownHighestBid.current = currentHighestBid;
        }
        const now = Date.now();
        if (now - lastOnUpdateAt.current < ON_UPDATE_THROTTLE_MS) return;
        lastOnUpdateAt.current = now;
        const minBid = currentHighestBid + 1;
        setBidAmount((prev) => (prev <= currentHighestBid ? minBid : prev));
      } else {
        lastKnownHighestBid.current = 0;
      }
    },
    onError: (err) => {
      console.error("Stream error:", err);
      setLoading(false);
    },
  });

  const contest = data?.contest;
  const players = data?.players || [];
  const pokemonPool = data?.pokemonPool || [];

  // SWR for complex relational data
  const myPokemonKey =
    contestId && playerId
      ? `/api/player/${playerId}/pokemon?contestId=${contestId}`
      : null;
  const historyKey = contestId
    ? `/api/admin/contests/${contestId}/history`
    : null;
  const fetcher = useCallback(async (url: string) => {
    const r = await apiFetch(url);
    return r.ok ? r.json() : [];
  }, []);
  const { data: myPokemonData, mutate: mutateMyPokemon } = useSWR(
    myPokemonKey,
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: draftHistoryData, mutate: mutateHistory } = useSWR(
    historyKey,
    fetcher,
    {
      revalidateOnFocus: false,
      // 历史动态定期刷新，避免只在特定 contest 字段变化时才更新
      refreshInterval: 3000,
    },
  );
  const myPokemon = myPokemonData ?? [];
  const draftHistory = draftHistoryData ?? [];

  const revalidateAdditionalData = useCallback(() => {
    mutateMyPokemon();
    mutateHistory();
  }, [mutateMyPokemon, mutateHistory]);

  // Custom Hooks for Logic Extraction
  const {
    actionSubmitting,
    bidSubmitting,
    optimisticPendingPoolId,
    finalizeAuction,
    submitDraftAction,
    placeBid: executeBid,
  } = useDraftActions({
    contestId: contestId || "",
    playerId: playerId || "",
    draftMode: contest?.draftMode || "SNAKE",
    showToast,
    revalidate: revalidateAdditionalData,
  });

  // 使用 ref 避免 onTimeEnd 闭包 stale
  const contestRef = useRef(contest);
  const finalizeAuctionRef = useRef(finalizeAuction);
  useEffect(() => {
    contestRef.current = contest;
  }, [contest]);
  useEffect(() => {
    finalizeAuctionRef.current = finalizeAuction;
  }, [finalizeAuction]);

  const { timeLeft } = useDraftTimer({
    bidEndTime: contest?.bidEndTime,
    auctionPhase: contest?.auctionPhase,
    status: contest?.status,
    isPaused: (contest as any)?.isPaused ?? contest?.status === "PAUSED",
    onTimeEnd: () => {
      // 暂停状态下不自动结算
      const currentContest = contestRef.current;
      if (
        (currentContest as any)?.isPaused ||
        currentContest?.status === "PAUSED"
      ) {
        return;
      }
      finalizeAuctionRef.current();
    },
  });

  // Throttled revalidation for stream updates
  const lastRelevantKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!contest || !myPokemonKey || !historyKey) return;
    const key = `${contest.currentTurn}-${contest.auctionPhase}-${contest.activePokemonId ?? ""}`;
    if (lastRelevantKeyRef.current !== key) {
      lastRelevantKeyRef.current = key;
      revalidateAdditionalData();
    }
  }, [contest, myPokemonKey, historyKey, revalidateAdditionalData]);

  // Auth & Init
  useEffect(() => {
    const pid = localStorage.getItem("playerId");
    const cid = localStorage.getItem("contestId");
    if (!pid || !cid) {
      router.push("/player/login");
    }
  }, [router]);
  useEffect(() => {
    if (!contestId || contest) return;
    const t = setTimeout(() => {
      localStorage.removeItem("playerId");
      localStorage.removeItem("contestId");
      router.push("/player/login?reason=session_expired");
    }, 12000);
    return () => clearTimeout(t);
  }, [contestId, contest, router]);

  // 心跳：定期上报玩家在线状态，驱动 PlayerSidebar 在线点
  useEffect(() => {
    if (!playerId || !contestId) return;

    const sendHeartbeat = async () => {
      try {
        await apiFetch("/api/player/heartbeat", { method: "POST" });
      } catch (e) {
        console.error("Heartbeat failed", e);
      }
    };

    // 立即发送一次，随后每 30 秒发送一次
    sendHeartbeat();
    const intervalId = setInterval(sendHeartbeat, 30000);

    return () => {
      clearInterval(intervalId);
    };
  }, [playerId, contestId]);

  const handlePoolAction = useCallback(
    (poolId: string) => {
      const item = pokemonPool.find((p) => p.id === poolId);
      if (!item) return;
      const action = contest?.draftMode === "SNAKE" ? "PICK" : "NOMINATE";
      setConfirmDialog({ item, action });
    },
    [pokemonPool, contest?.draftMode, setConfirmDialog],
  );

  const confirmSelection = async () => {
    if (!confirmDialog) return;
    const poolId = confirmDialog.item.id;
    setConfirmDialog(null);
    await submitDraftAction(poolId);
  };

  const placeBid = useCallback(async () => {
    await executeBid(bidAmount);
  }, [executeBid, bidAmount]);

  const draftLen = contest?.draftOrder?.length || 0;
  const currentPlayerId = draftLen
    ? (contest as any).draftOrder[contest!.currentTurn % draftLen]
    : undefined;
  const isMyTurn =
    contest?.draftMode === "SNAKE"
      ? currentPlayerId === playerId
      : contest?.auctionPhase === "NOMINATING" && currentPlayerId === playerId;
  const me = players.find((p) => p.id === playerId);
  const activePokemon = contest?.activePokemonId
    ? pokemonPool.find((p) => p.id === contest.activePokemonId)
    : null;

  // UI Effects
  useEffect(() => {
    if (!contest) return;
    if (
      prevAuctionPhase.current === "NOMINATING" &&
      contest.auctionPhase === "BIDDING"
    ) {
      const pName =
        activePokemon?.pokemon.nameCn || activePokemon?.pokemon.name;
      showToast({
        type: "info",
        message: `竞价开始！${pName || "宝可梦"} 正在拍卖中`,
      });
      if (activeMobileTab !== "right") setHasUnreadBid(true);
      lastKnownHighestBid.current = contest.highestBid || 0;
    }
    prevAuctionPhase.current = contest.auctionPhase;
  }, [
    contest?.auctionPhase,
    contest?.highestBid,
    activePokemon,
    activeMobileTab,
    showToast,
  ]);

  if (loading && !contest)
    return (
      <div className="flex min-h-screen animate-pulse items-center justify-center bg-gray-900 text-white">
        加载选秀房间中...
      </div>
    );
  if (!contest)
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
        比赛未找到
      </div>
    );

  // Layout Logic
  const showAuctionPanel =
    contest.draftMode === "AUCTION" &&
    contest.auctionPhase === "BIDDING" &&
    activePokemon;

  // DP Pre-check for Snake Draft
  const dpPreCheck =
    confirmDialog &&
    contest?.draftMode === "SNAKE" &&
    me &&
    (() => {
      const cost = confirmDialog.item?.basePrice ?? 0;
      const ownedCount =
        me._count?.ownedPokemon ?? me.ownedPokemon?.length ?? 0;
      const tokens = (me as any).tokens ?? contest?.playerTokens ?? 0;
      const availablePrices = pokemonPool
        .filter(
          (p) => p.status === "AVAILABLE" && p.id !== confirmDialog!.item?.id,
        )
        .map((p) => p.basePrice ?? 0);

      return canFillTeamAfterOperation(
        tokens,
        ownedCount,
        contest.maxPokemonPerPlayer,
        cost,
        availablePrices,
      );
    })();

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
                {contest.draftMode === "SNAKE" ? "蛇形模式" : "竞价模式"} • 第{" "}
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
                e.preventDefault();
                try {
                  await apiFetch("/api/player/logout", { method: "POST" });
                } catch {
                  window.location.href = "/api/player/logout";
                  return;
                }
                localStorage.removeItem("playerId");
                localStorage.removeItem("contestId");
                router.push("/player/login");
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
          className={`${activeMobileTab === "left" ? "flex" : "hidden md:flex"} z-10 min-h-0 w-full flex-1 flex-shrink-0 overflow-y-auto md:w-80 md:flex-none md:overflow-visible`}
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
          className={`${activeMobileTab === "center" ? "flex" : "hidden md:flex"} relative min-w-0 flex-1 flex-col overflow-y-auto md:overflow-visible`}
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

          {/* Status Banner - 仅在提名阶段或蛇形模式显示 */}
          {contest.draftMode === "SNAKE" ||
          contest.auctionPhase === "NOMINATING" ? (
            <div className="px-4 py-3 md:px-6 md:pb-0">
              <div
                className={`flex items-center gap-3 rounded-xl border p-4 ${isMyTurn ? "border-blue-500 bg-blue-100 dark:bg-blue-600/20" : "border-gray-200 bg-white dark:border-white/5 dark:bg-white/5"}`}
              >
                <div
                  className={`h-3 w-3 rounded-full ${isMyTurn ? "animate-ping bg-blue-500" : "bg-gray-400"}`}
                ></div>
                <span className="text-sm font-black">
                  {isMyTurn
                    ? "轮到你操作"
                    : `等待 ${players.find((p) => p.id === currentPlayerId)?.username || "其他选手"} 操作...`}
                </span>
              </div>
            </div>
          ) : null}

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
          className={`${activeMobileTab === "right" ? "flex" : "hidden md:flex"} min-h-0 w-full flex-1 flex-col overflow-y-auto border-l border-gray-200 bg-white md:w-80 md:flex-none md:overflow-visible dark:border-white/5 dark:bg-gray-950`}
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
                  (a) => a.actionType === "BID",
                );
                const bidAmounts = bidActions.map(
                  (a) => a.details?.bidAmount || 0,
                );
                const maxBid =
                  bidAmounts.length > 0 ? Math.max(...bidAmounts) : 100;
                const minBid =
                  bidAmounts.length > 0 ? Math.min(...bidAmounts) : 0;

                return (draftHistory as DraftHistoryItem[]).map(
                  (action, idx) => {
                    const isHighestBid =
                      action.actionType === "BID" &&
                      action.details?.bidAmount === maxBid;
                    return (
                      <BidHistoryItem
                        key={idx}
                        action={action}
                        isHighestBid={isHighestBid}
                        maxBid={maxBid}
                        minBid={minBid}
                      />
                    );
                  },
                );
              })()}
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile Tab Bar */}
      <nav className="fixed right-0 bottom-0 left-0 z-[90] flex items-center justify-around border-t border-gray-200 bg-white/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden dark:border-white/10 dark:bg-gray-900/95">
        <button
          onClick={() => handleTabChange("left")}
          className={`flex flex-1 flex-col items-center py-2 ${activeMobileTab === "left" ? "text-blue-500" : "text-gray-500"}`}
        >
          <span className="text-[10px] font-black">顺位</span>
        </button>
        <button
          onClick={() => handleTabChange("center")}
          className={`flex flex-1 flex-col items-center py-2 ${activeMobileTab === "center" ? "text-blue-500" : "text-gray-500"}`}
        >
          <span className="text-[10px] font-black">宝可梦</span>
        </button>
        <button
          onClick={() => handleTabChange("right")}
          className={`relative flex flex-1 flex-col items-center py-2 ${activeMobileTab === "right" ? "text-blue-500" : "text-gray-500"}`}
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
                      "lg",
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
                {actionSubmitting ? "提交中" : "确认"}
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
  );
}
