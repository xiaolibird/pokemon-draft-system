import { getPokemonStaticIcon } from "@/app/lib/utils/helpers";
import { memo, useEffect } from "react";

interface AuctionPanelProps {
  contest: any;
  activePokemon: any;
  timeLeft: number | null;
  bidAmount: number;
  setBidAmount: (amount: number) => void;
  onBid: () => void;
  isSubmitting: boolean;
  playerId: string | null;
  onForceRefresh?: () => void;
  onFinalize?: () => void;
}

export const AuctionPanel = memo(function AuctionPanel({
  contest,
  activePokemon,
  timeLeft,
  bidAmount,
  setBidAmount,
  onBid,
  isSubmitting,
  playerId,
  isSpectator = false,
  onForceRefresh,
  onFinalize,
}: AuctionPanelProps & { isSpectator?: boolean }) {
  const isStuck = timeLeft !== null && timeLeft <= 0;

  // Auto-refresh logic for stuck state
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    if (
      contest &&
      contest.draftMode === "AUCTION" &&
      contest.auctionPhase === "BIDDING" &&
      activePokemon &&
      isStuck &&
      onForceRefresh
    ) {
      // If stuck for more than 5 seconds, try to refresh AND finalize
      timeoutId = setTimeout(() => {
        console.log("Auto-refreshing stuck auction state...");
        onForceRefresh();
        if (onFinalize) {
          console.log("Retrying finalize...");
          onFinalize();
        }
      }, 5000);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isStuck, onForceRefresh, onFinalize, contest, activePokemon]);

  if (
    !contest ||
    contest.draftMode !== "AUCTION" ||
    contest.auctionPhase !== "BIDDING" ||
    !activePokemon
  ) {
    return null;
  }

  const highestBid = contest.highestBid || 0;
  const currentPrice = contest.highestBid || activePokemon.basePrice || 0;
  const minBid = highestBid + 1;
  const isHighestBidder = contest.highestBidderId === playerId;

  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 p-6 text-white shadow-lg">
      {/* Background Pattern */}
      <div className="pointer-events-none absolute top-0 right-0 h-64 w-64 translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 blur-3xl"></div>

      <div className="relative z-10 flex flex-col items-center justify-between gap-6 md:flex-row">
        {/* Pokemon Info */}
        <div className="flex w-full items-center gap-4 md:w-auto">
          <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/20 shadow-inner backdrop-blur-md">
            <span
              className="picon picon-lg"
              style={
                typeof getPokemonStaticIcon(
                  activePokemon.pokemon.num,
                  activePokemon.pokemon.name,
                  "lg",
                ) === "object"
                  ? (getPokemonStaticIcon(
                      activePokemon.pokemon.num,
                      activePokemon.pokemon.name,
                      "lg",
                    ) as any)
                  : {}
              }
            />
          </div>
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded bg-white/20 px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase">
                正在竞拍
              </span>
              {timeLeft !== null ? (
                <span
                  className={`text-xs font-bold ${timeLeft <= 5000 ? "animate-pulse text-red-200" : "text-orange-100"}`}
                >
                  {timeLeft <= 0
                    ? "同步中..."
                    : `倒计时 ${Math.ceil(timeLeft / 1000)}s`}
                </span>
              ) : (
                <span className="text-xs font-bold text-orange-100">
                  等待管理员手动结束
                </span>
              )}
            </div>
            <h2 className="text-2xl leading-tight font-black">
              {activePokemon.pokemon.nameCn || activePokemon.pokemon.name}
            </h2>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-sm opacity-80">当前价格</span>
              <span className="font-mono text-3xl font-black tracking-tight">
                {currentPrice} G
              </span>
            </div>
          </div>
        </div>

        {/* Bidding Controls / Spectator View */}
        <div className="w-full rounded-xl border border-white/10 bg-white/10 p-4 backdrop-blur-md md:w-auto">
          {timeLeft !== null && timeLeft <= 0 ? (
            <div className="flex min-w-[200px] flex-col items-center justify-center gap-2 px-6 py-2 text-center">
              <div className="flex items-center gap-2">
                <div className="flex h-12 w-12 animate-pulse items-center justify-center rounded-full bg-amber-500 text-white shadow-lg">
                  <svg
                    className="h-6 w-6 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </div>
              </div>
              <div>
                <p className="text-lg font-bold">等待结果...</p>
                <p className="text-sm opacity-75">正在同步服务器状态</p>
              </div>
              {/* Fix for Issue #2: Stuck in Syncing */}
              {onForceRefresh && (
                <button
                  onClick={onForceRefresh}
                  className="mt-2 text-xs font-bold text-white/80 underline decoration-dashed hover:text-white"
                >
                  太久没反应？点此刷新
                </button>
              )}
            </div>
          ) : isSpectator ? (
            <div className="min-w-[200px] px-6 py-2 text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white">
                <span className="text-2xl">👀</span>
              </div>
              <p className="text-lg font-bold">观战模式</p>
              <p className="text-sm opacity-75">正在等待选手出价...</p>
            </div>
          ) : isHighestBidder ? (
            <div className="px-6 py-2 text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 animate-bounce items-center justify-center rounded-full bg-green-500 text-white shadow-lg">
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
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="text-lg font-bold">当前最高出价！</p>
              <p className="text-sm opacity-75">请等待其他选手出价</p>
            </div>
          ) : (
            <div className="flex min-w-[280px] flex-col gap-3">
              {/* Quick Add Buttons */}
              <div className="flex justify-between gap-1">
                {[1, 5, 10, 20, 50].map((num) => (
                  <button
                    key={num}
                    onClick={() =>
                      setBidAmount(Math.max(minBid, currentPrice + num))
                    }
                    className="flex-1 rounded bg-white/10 py-1 text-[10px] font-bold transition hover:bg-white/20 active:scale-95"
                    title={`加 ${num} G`}
                  >
                    +{num}
                  </button>
                ))}
              </div>

              {/* Manual Input Control */}
              <div className="flex items-center gap-2 rounded-lg bg-black/20 p-1 pr-2">
                <button
                  onClick={() => setBidAmount(Math.max(minBid, bidAmount - 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 transition hover:bg-white/20 disabled:opacity-50"
                  disabled={bidAmount <= minBid}
                >
                  -
                </button>
                <input
                  type="number"
                  value={bidAmount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val)) {
                      setBidAmount(val);
                    }
                  }}
                  onBlur={() => {
                    if (bidAmount < minBid) setBidAmount(minBid);
                  }}
                  className="m-0 w-full flex-1 appearance-none border-none bg-transparent p-0 text-center font-mono text-xl font-black text-white placeholder-white/50 outline-none focus:ring-0"
                  min={minBid}
                  style={{ MozAppearance: "textfield" }}
                />
                <button
                  onClick={() => setBidAmount(bidAmount + 1)}
                  className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 transition hover:bg-white/20"
                >
                  +
                </button>
              </div>

              <button
                onClick={onBid}
                disabled={isSubmitting || bidAmount < minBid}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-white py-3 text-lg font-black text-orange-600 shadow-lg transition hover:bg-orange-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-orange-600 border-t-transparent"></div>
                    出价中...
                  </>
                ) : (
                  <>
                    出价 <span className="font-mono">{bidAmount} G</span>
                  </>
                )}
              </button>
              <div className="flex justify-between px-1 text-[10px] font-bold opacity-60">
                <span>最低出价: {minBid} G</span>
                <button
                  onClick={() => setBidAmount(minBid)}
                  className="underline decoration-dashed hover:text-white"
                >
                  设为最低
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
