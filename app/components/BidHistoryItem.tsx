"use client";

import { getPokemonStaticIcon } from "@/app/lib/utils/helpers";
import { getBidActionTheme } from "@/app/lib/utils/theme-helpers";

interface BidHistoryItemProps {
  action: any;
  isHighestBid?: boolean;
  maxBid?: number;
  minBid?: number;
}

export function BidHistoryItem({
  action,
  isHighestBid = false,
  maxBid = 100,
  minBid = 0,
}: BidHistoryItemProps) {
  const actor =
    action.details?.actorUsername || action.player?.username || "系统";
  const bidAmount = action.details?.bidAmount || 0;
  const actionType = action.actionType;
  const pokemonName = action.details?.pokemonName;

  // Calculate percentage for HP bar (0-100%)
  const range = maxBid - minBid;
  const percentage =
    range > 0
      ? Math.min(100, Math.max(0, ((bidAmount - minBid) / range) * 100))
      : 0;

  // Theme configuration based on action type
  const theme = getBidActionTheme(
    actionType,
    isHighestBid,
    pokemonName,
    action.details,
  );

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
              backgroundSize: "cover",
              backgroundPosition: theme.imgPos,
              maskImage:
                "radial-gradient(circle at center, black 40%, transparent 100%)",
              WebkitMaskImage:
                "radial-gradient(circle at center, black 40%, transparent 100%)",
              opacity: 0.85,
              transform: "scale(1.2)",
            }}
          />
        ) : (
          (actionType === "PICK" ||
            actionType === "NOMINATE" ||
            actionType === "ADMIN_UNDO") && (
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
            width: actionType === "BID" ? `${percentage}%` : "100%",
            clipPath:
              actionType === "BID"
                ? "polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%)"
                : "none",
          }}
        />
        {/* Unfilled part is transparent so image shows through */}
        {actionType === "BID" && <div className="flex-1" />}
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
              hour: "2-digit",
              minute: "2-digit",
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
          {actionType === "BID" ? (
            <span
              className={`rounded bg-white/20 px-2 py-0.5 font-mono font-black shadow-sm backdrop-blur-md dark:bg-black/20 ${isHighestBid ? "text-2xl" : "text-xl"} ${theme.text} drop-shadow-sm`}
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
  );
}
