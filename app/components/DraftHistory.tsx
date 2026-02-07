/**
 * DraftHistory Component
 *
 * Displays the timeline of draft actions
 */

"use client";

interface DraftHistoryProps {
  history: any[];
  isOpen: boolean;
  onClose: () => void;
}

export function DraftHistory({ history, isOpen, onClose }: DraftHistoryProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-white/5">
          <h3 className="text-lg font-black">选秀历史记录</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-2 transition hover:bg-gray-100 dark:hover:bg-white/10"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {history.length === 0 ? (
            <p className="py-8 text-center text-gray-500">暂无记录</p>
          ) : (
            history.map((action, idx) => {
              const actor =
                action.details?.actorUsername ||
                action.details?.actor ||
                action.player?.username ||
                "系统";
              const actionLabel =
                action.actionType === "PICK" && action.details?.auctionWin
                  ? "竞拍成交获得"
                  : action.actionType === "PICK"
                    ? "选择了"
                    : action.actionType === "NOMINATE"
                      ? "提名了"
                      : action.actionType === "BID"
                        ? `出价 ${action.details?.bidAmount ?? action.details?.finalPrice ?? 0}G`
                        : action.actionType === "NOMINATE_SKIP"
                          ? "被跳过"
                          : action.actionType === "ADMIN_PAUSE"
                            ? "暂停了选秀"
                            : action.actionType === "ADMIN_RESUME"
                              ? "恢复了选秀"
                              : action.actionType === "ADMIN_UNDO"
                                ? "撤销了"
                                : action.actionType === "ADMIN_SKIP"
                                  ? "跳过了"
                                  : "";
              const targetName =
                action.details?.skippedUsername ||
                action.details?.undoneUsername ||
                action.details?.pokemonName;

              return (
                <div
                  key={idx}
                  className="flex items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-white/5"
                >
                  <span className="w-16 flex-shrink-0 text-xs text-gray-400">
                    {new Date(action.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="text-sm font-bold">{actor}</span>
                  <span className="text-sm text-gray-500">{actionLabel}</span>
                  {targetName && (
                    <span className="text-sm font-bold text-blue-500">
                      {targetName}
                    </span>
                  )}
                  {action.actionType === "BID" &&
                    action.details?.pokemonName && (
                      <span className="text-xs text-gray-400">
                        ({action.details.pokemonName})
                      </span>
                    )}
                  {action.actionType === "ADMIN_UNDO" &&
                    action.details?.pokemonName && (
                      <span className="text-xs text-gray-400">
                        ({action.details.pokemonName})
                      </span>
                    )}
                  {action.actionType === "NOMINATE_SKIP" &&
                    action.details?.reason && (
                      <span className="text-xs text-gray-400">
                        ({action.details.reason})
                      </span>
                    )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
