import { useState, useCallback, useRef } from "react";
import { apiFetch } from "../api/fetch";

interface UseDraftActionsProps {
  contestId: string;
  playerId: string;
  draftMode: "SNAKE" | "AUCTION" | string;
  showToast: (opts: {
    type: "error" | "success" | "info";
    message: string;
    suggestion?: string;
  }) => void;
  revalidate: () => void;
}

export function useDraftActions({
  contestId,
  playerId,
  draftMode,
  showToast,
  revalidate,
}: UseDraftActionsProps) {
  const [finalizing, setFinalizing] = useState(false);
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [bidSubmitting, setBidSubmitting] = useState(false);
  const [optimisticPendingPoolId, setOptimisticPendingPoolId] = useState<
    string | null
  >(null);

  const finalizingRef = useRef(false);
  const lastActionAt = useRef<number>(0);
  const lastBidAt = useRef<number>(0);
  const DEBOUNCE_MS = 500;

  const finalizeAuction = useCallback(async () => {
    if (finalizingRef.current) return;
    finalizingRef.current = true;
    setFinalizing(true);
    try {
      const res = await apiFetch("/api/player/auction/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contestId }),
      });
      if (res.ok) revalidate();
    } catch (err) {
      console.error("Finalize failed", err);
    } finally {
      finalizingRef.current = false;
      setFinalizing(false);
    }
  }, [contestId, revalidate]);

  const submitDraftAction = useCallback(
    async (poolId: string) => {
      if (actionSubmitting) return;
      const now = Date.now();
      if (now - lastActionAt.current < DEBOUNCE_MS) return;
      lastActionAt.current = now;

      setOptimisticPendingPoolId(poolId);
      setActionSubmitting(true);

      try {
        const endpoint =
          draftMode === "SNAKE"
            ? "/api/player/draft-pick"
            : "/api/player/nominate";
        const res = await apiFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pokemonPoolId: poolId }),
        });

        const json = await res.json().catch(async () => {
          const text = await res.text().catch(() => "No response body");
          console.error(`API Error [${res.status}]: ${text}`);
          return {};
        });

        if (res.ok) {
          revalidate();
        } else {
          setOptimisticPendingPoolId(null);
          showToast({
            type: "error",
            message: json.error || "操作失败",
            suggestion: json.suggestion,
          });
        }
      } catch (err) {
        setOptimisticPendingPoolId(null);
        showToast({ type: "error", message: "网络错误" });
      } finally {
        setActionSubmitting(false);
        setOptimisticPendingPoolId(null);
      }
    },
    [actionSubmitting, draftMode, revalidate, showToast],
  );

  const placeBid = useCallback(
    async (amount: number) => {
      const now = Date.now();
      if (bidSubmitting) return;
      if (now - lastBidAt.current < DEBOUNCE_MS) return;
      lastBidAt.current = now;
      setBidSubmitting(true);

      const timeoutId = setTimeout(() => {
        setBidSubmitting(false);
        showToast({ type: "error", message: "请求超时，请重试" });
      }, 10000);

      try {
        const res = await apiFetch("/api/player/bid", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount }),
        });

        clearTimeout(timeoutId);
        const json = await res.json().catch(async () => {
          const text = await res.text().catch(() => "No response body");
          console.error(`API Error [${res.status}]: ${text}`);
          return {};
        });

        if (res.ok) {
          revalidate();
        } else {
          showToast({ type: "error", message: json.error || "出价失败" });
        }
      } catch (err) {
        clearTimeout(timeoutId);
        showToast({ type: "error", message: "网络错误" });
      } finally {
        setBidSubmitting(false);
      }
    },
    [bidSubmitting, revalidate, showToast],
  );

  return {
    finalizing,
    actionSubmitting,
    bidSubmitting,
    optimisticPendingPoolId,
    finalizeAuction,
    submitDraftAction,
    placeBid,
  };
}
