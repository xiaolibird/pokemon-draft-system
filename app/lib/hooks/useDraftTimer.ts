import { useState, useEffect, useRef } from "react";

interface UseDraftTimerProps {
  bidEndTime: string | Date | null | undefined;
  auctionPhase: string | null | undefined;
  /**
   * 是否处于暂停状态（优先于 status 判断）
   */
  isPaused?: boolean;
  /**
   * 比赛整体状态，用于兜底判断是否暂停
   */
  status?: string | null;
  onTimeEnd: () => void;
}

export function useDraftTimer({
  bidEndTime,
  auctionPhase,
  isPaused,
  status,
  onTimeEnd,
}: UseDraftTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const onTimeEndRef = useRef(onTimeEnd);

  const effectivePaused =
    isPaused === true || status === "PAUSED" || status === "COMPLETED";

  // Update ref to avoid stale closure
  useEffect(() => {
    onTimeEndRef.current = onTimeEnd;
  }, [onTimeEnd]);

  useEffect(() => {
    if (bidEndTime && auctionPhase === "BIDDING" && !effectivePaused) {
      const timer = setInterval(() => {
        const diff = new Date(bidEndTime).getTime() - Date.now();
        setTimeLeft(diff);
      }, 1000);
      return () => clearInterval(timer);
    } else {
      setTimeLeft(null);
    }
  }, [bidEndTime, auctionPhase, effectivePaused]);

  // Trigger callback when time ends（仅在未暂停时触发）
  useEffect(() => {
    if (
      timeLeft !== null &&
      timeLeft <= 0 &&
      auctionPhase === "BIDDING" &&
      !effectivePaused
    ) {
      onTimeEndRef.current();
    }
  }, [timeLeft, auctionPhase, effectivePaused]);

  return { timeLeft };
}
