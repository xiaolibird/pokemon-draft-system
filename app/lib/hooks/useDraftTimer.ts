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
  /**
   * 服务器时间偏移量（毫秒），用于校准倒计时
   * 当客户端时钟与服务器不同步时，此偏移量用于校正时间计算
   * 正值表示服务器时间比本地时间快，负值表示服务器时间比本地时间慢
   */
  serverOffset?: number;
}

export function useDraftTimer({
  bidEndTime,
  auctionPhase,
  isPaused,
  status,
  onTimeEnd,
  serverOffset = 0,
}: UseDraftTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const onTimeEndRef = useRef(onTimeEnd);
  const prevTimeLeftRef = useRef<number | null>(null);

  const effectivePaused =
    isPaused === true || status === "PAUSED" || status === "COMPLETED";

  // Update refs to avoid stale closures
  useEffect(() => {
    onTimeEndRef.current = onTimeEnd;
  }, [onTimeEnd]);

  useEffect(() => {
    if (bidEndTime && auctionPhase === "BIDDING" && !effectivePaused) {
      const timer = setInterval(() => {
        // Use server-adjusted time to prevent clock skew issues
        // serverOffset compensates for clock differences between client and server
        const adjustedNow = Date.now() + (serverOffset ?? 0);
        const diff = new Date(bidEndTime).getTime() - adjustedNow;
        setTimeLeft(diff);
      }, 1000);
      return () => clearInterval(timer);
    } else {
      setTimeLeft(null);
    }
  }, [bidEndTime, auctionPhase, effectivePaused, serverOffset]);

  // Trigger callback when time ends（仅在未暂停时触发）
  // 容错处理：如果 timeLeft < 0，保持 0 并等待服务器状态变更
  // 避免因时钟偏移导致的误判
  useEffect(() => {
    // 只有当 timeLeft 变为 0 或负数时才触发回调（从正数变为非正数）
    if (
      timeLeft !== null &&
      timeLeft <= 0 &&
      auctionPhase === "BIDDING" &&
      !effectivePaused &&
      prevTimeLeftRef.current !== null &&
      prevTimeLeftRef.current > 0
    ) {
      // 刚刚变成 0 或负数，触发回调
      onTimeEndRef.current();
    }

    // 更新 previous value
    prevTimeLeftRef.current = timeLeft;
  }, [timeLeft, auctionPhase, effectivePaused]);

  return { timeLeft };
}
