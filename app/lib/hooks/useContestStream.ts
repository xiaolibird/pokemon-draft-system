/**
 * useContestStream - Shared SSE/Polling Hook
 *
 * Provides real-time contest updates via SSE with automatic fallback to polling.
 * Eliminates duplication between DraftRoom and AdminSpectate pages.
 *
 * Update 2026-02-03: Added support for 'partial' (LITE) updates to reduce bandwidth.
 * Update 2026-02-08: Added structured logging and connection quality monitoring.
 */

import { apiFetch } from "../api/fetch";
import { useCallback, useEffect, useRef, useState } from "react";

import { PoolItem, Contest, PlayerWithRelations } from "@/app/types/draft";
import { logDebug, logWarn, logInfo, logError } from "../logger-client";

// SSE 配置常量
const POLLING_INTERVAL = 2000; // Polling间隔
const MAX_CONSECUTIVE_ERRORS = 2; // 最大连续错误次数

export interface ContestStreamData {
  contest: Contest;
  players: PlayerWithRelations[];
  pokemonPool: PoolItem[];
}

export interface UseContestStreamOptions {
  contestId: string;
  onUpdate?: (data: ContestStreamData) => void;
  onError?: (error: Error) => void;
  enabled?: boolean;
}

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "polling"
  | "disconnected";

export type ConnectionQuality = "good" | "poor" | "disconnected";

export function isSSESupported(): boolean {
  return typeof EventSource !== "undefined";
}

export function useContestStream(options: UseContestStreamOptions) {
  const { contestId, onUpdate, onError, enabled = true } = options;

  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [data, setData] = useState<ContestStreamData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [serverOffset, setServerOffset] = useState<number>(0);
  const [connectionQuality, setConnectionQuality] =
    useState<ConnectionQuality>("good");

  // Refs to avoid stale closures in event handlers
  const lastUpdateRef = useRef<number>(0);
  const onUpdateRef = useRef(onUpdate);
  const onErrorRef = useRef(onError);
  const dataRef = useRef<ContestStreamData | null>(null);
  const consecutiveErrors = useRef(0); // 连续错误计数，用于判断连接质量

  // Update refs when options change
  useEffect(() => {
    onUpdateRef.current = onUpdate;
    onErrorRef.current = onError;
  }, [onUpdate, onError]);

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Helper to safely update data and ref
  const updateDataSafe = useCallback((newData: ContestStreamData) => {
    dataRef.current = newData;
    setData(newData);
    onUpdateRef.current?.(newData);
  }, []);

  // Fetch contest data via polling
  const fetchData = useCallback(async () => {
    if (!enabled || !isMountedRef.current) return;

    try {
      const res = await apiFetch(`/api/admin/contests/${contestId}`, {
        headers: { "Cache-Control": "no-cache" },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const contestData = await res.json();
      const timestamp = contestData.timestamp || Date.now();

      // Calculate server time offset to handle clock skew between client and server
      // This ensures accurate countdown even when client clock is out of sync
      const currentServerTime = contestData.timestamp || Date.now();
      setServerOffset(currentServerTime - Date.now());

      // 重置连续错误计数
      consecutiveErrors.current = 0;
      setConnectionQuality("good");

      // Race Condition Prevention: Only update if this is newer
      if (timestamp < lastUpdateRef.current) {
        logDebug("Ignore stale fetch data", {
          contestId,
          timestamp,
          last: lastUpdateRef.current,
        });
        return;
      }
      lastUpdateRef.current = timestamp;

      const streamData: ContestStreamData = {
        contest: contestData,
        players: contestData.players || [],
        pokemonPool: contestData.pokemonPool || [],
      };

      updateDataSafe(streamData);
      setError(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      consecutiveErrors.current++;

      // 根据连续错误次数设置连接质量
      if (consecutiveErrors.current >= MAX_CONSECUTIVE_ERRORS) {
        setConnectionQuality("disconnected");
        logWarn("SSE disconnected, falling back to polling", {
          contestId,
          consecutiveErrors: consecutiveErrors.current,
        });
      } else {
        setConnectionQuality("poor");
      }

      setError(error);
      onErrorRef.current?.(error);
    }
  }, [contestId, enabled, updateDataSafe]);

  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const BASE_RECONNECT_DELAY = 3000;

  // Setup SSE connection
  const connectSSE = useCallback(() => {
    if (!isSSESupported() || !enabled) {
      setStatus("polling");
      return false;
    }

    // Clear any existing reconnect timer
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    try {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      logDebug("Attempting SSE connection", {
        contestId,
        attempt: reconnectAttempts.current + 1,
      });
      const eventSource = new EventSource(`/api/contests/${contestId}/stream`);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        if (!isMountedRef.current) return;
        setStatus("connected");
        setError(null);

        // 重置连续错误计数和尝试次数
        consecutiveErrors.current = 0;
        reconnectAttempts.current = 0;
        setConnectionQuality("good");
        logInfo("SSE connected", { contestId });

        // Clear polling if SSE is working
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      };

      eventSource.onmessage = (event) => {
        if (!isMountedRef.current) return;

        try {
          const parsed = JSON.parse(event.data);

          if (parsed.type === "connected") {
            logDebug("SSE connection established", { contestId });
            setError(null);
            return;
          }

          const serverTime = parsed.timestamp || Date.now();

          // Calculate server time offset from SSE message
          // This compensates for clock skew between client and server
          setServerOffset(serverTime - Date.now());

          // Race Condition Prevention: Only update if this is newer
          if (serverTime < lastUpdateRef.current) {
            logDebug("Ignore stale SSE data", {
              contestId,
              timestamp: serverTime,
              last: lastUpdateRef.current,
            });
            return;
          }
          lastUpdateRef.current = serverTime;

          if (parsed.type === "partial") {
            // Merge partial data (Optimized update mode)
            // This allows the server to send only dynamic fields (status, price, bid)
            // while we preserve static data (pokemon info, types, etc.)

            const prev = dataRef.current;

            // Fallback: If we don't have prev data, we can't do a smart merge.
            // Trigger full fetch.
            if (!prev) {
              console.warn(
                "[useContestStream] Received partial update without previous state, triggering full fetch",
              );
              fetchData();
              return;
            }

            // 1. Contest: Simple merge
            const partialContest = parsed.contest || {};
            const newContest = { ...prev.contest, ...partialContest };

            // 2. Players: Replace if provided (Optimized payload includes lightweight player list)
            const newPlayers = parsed.players || prev.players;

            // 3. Pokemon Pool: Smart Merge
            // The server sends [{ id, status, ... }] without static 'pokemon' data.
            // We must preserve the existing 'pokemon' object.
            let newPool = prev.pokemonPool;
            if (parsed.pokemonPool && Array.isArray(parsed.pokemonPool)) {
              // Create map for O(1) lookup
              const existingMap = new Map(
                prev.pokemonPool.map((p) => [p.id, p]),
              );

              newPool = parsed.pokemonPool.map(
                (newItem: Partial<PoolItem> & { id: string }) => {
                  const existing = existingMap.get(newItem.id);
                  if (existing) {
                    // Merge: keep existing static data, overwrite with new dynamic data
                    return { ...existing, ...newItem };
                  }
                  // If it's a completely new item, return as is (should contain full data in that case, or we accept it's bare)
                  return newItem;
                },
              );
            }

            const mergedData: ContestStreamData = {
              contest: newContest,
              players: newPlayers,
              pokemonPool: newPool,
            };

            updateDataSafe(mergedData);
          } else {
            // Full state update (e.g. initial connection or hard refresh)
            const streamData: ContestStreamData = {
              contest: parsed.contest,
              players: parsed.contest.players || [],
              pokemonPool: parsed.contest.pokemonPool || [],
            };
            updateDataSafe(streamData);
          }

          setError(null);
        } catch (err) {
          console.error("SSE parse error:", err);
        }
      };

      eventSource.onerror = (e) => {
        if (!isMountedRef.current) return;

        consecutiveErrors.current++;

        logWarn("SSE error occurred", {
          contestId,
          consecutiveErrors: consecutiveErrors.current,
          maxErrors: MAX_CONSECUTIVE_ERRORS,
        });

        // Close current connection
        eventSource.close();
        eventSourceRef.current = null;

        if (consecutiveErrors.current >= MAX_CONSECUTIVE_ERRORS) {
          setConnectionQuality("disconnected");
          setStatus("polling");

          logWarn("SSE disconnected after max errors, switched to polling", {
            contestId,
            maxErrors: MAX_CONSECUTIVE_ERRORS,
          });

          // Schedule reconnection with exponential backoff
          if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.min(
              BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts.current),
              30000, // Max 30s
            );

            logInfo(`Scheduling SSE reconnect in ${delay}ms`, {
              contestId,
              attempt: reconnectAttempts.current + 1,
            });

            reconnectTimerRef.current = setTimeout(() => {
              reconnectAttempts.current++;
              connectSSE();
            }, delay);
          } else {
            logError(
              "SSE max reconnect attempts reached, staying in polling mode",
              new Error("Max reconnect attempts"),
              { contestId },
            );
          }
        } else {
          setConnectionQuality("poor");
          // Immediate retry for minor errors (flicker)
          connectSSE();
        }

        // Ensure polling is running if we are not connected
        if (!pollIntervalRef.current) {
          pollIntervalRef.current = setInterval(fetchData, POLLING_INTERVAL);
        }
      };

      return true;
    } catch (err) {
      console.error("Failed to create EventSource:", err);
      setStatus("polling");
      return false;
    }
  }, [contestId, enabled, fetchData, updateDataSafe]);

  // Initialize connection
  useEffect(() => {
    if (!enabled) {
      setStatus("disconnected");
      return;
    }

    isMountedRef.current = true;

    // Initial data fetch (Full)
    fetchData();

    // Try SSE first
    connectSSE();

    return () => {
      isMountedRef.current = false;

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [enabled, fetchData, connectSSE]);

  // Stop polling/SSE when contest is completed
  useEffect(() => {
    if (data?.contest?.status === "COMPLETED") {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      setStatus("disconnected");
    }
  }, [data?.contest?.status]);

  return {
    data,
    status,
    error,
    refetch: fetchData,
    serverOffset,
    connectionQuality,
  };
}
