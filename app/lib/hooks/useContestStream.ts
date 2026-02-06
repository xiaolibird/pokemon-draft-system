/**
 * useContestStream - Shared SSE/Polling Hook
 *
 * Provides real-time contest updates via SSE with automatic fallback to polling.
 * Eliminates duplication between DraftRoom and AdminSpectate pages.
 *
 * Update 2026-02-03: Added support for 'partial' (LITE) updates to reduce bandwidth.
 */

import { apiFetch } from '../api/fetch'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface ContestStreamData {
  contest: any
  players: any[]
  pokemonPool: any[]
}

export interface UseContestStreamOptions {
  contestId: string
  onUpdate?: (data: ContestStreamData) => void
  onError?: (error: Error) => void
  enabled?: boolean
}

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'polling'
  | 'disconnected'

export function isSSESupported(): boolean {
  return typeof EventSource !== 'undefined'
}

export function useContestStream(options: UseContestStreamOptions) {
  const { contestId, onUpdate, onError, enabled = true } = options

  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [data, setData] = useState<ContestStreamData | null>(null)
  const [error, setError] = useState<Error | null>(null)

  // Refs to avoid stale closures in event handlers
  const lastUpdateRef = useRef<number>(0)
  const onUpdateRef = useRef(onUpdate)
  const onErrorRef = useRef(onError)
  const dataRef = useRef<ContestStreamData | null>(null)

  // Update refs when options change
  useEffect(() => {
    onUpdateRef.current = onUpdate
    onErrorRef.current = onError
  }, [onUpdate, onError])

  const eventSourceRef = useRef<EventSource | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isMountedRef = useRef(true)

  // Helper to safely update data and ref
  const updateDataSafe = useCallback((newData: ContestStreamData) => {
    dataRef.current = newData
    setData(newData)
    onUpdateRef.current?.(newData)
  }, [])

  // Fetch contest data via polling
  const fetchData = useCallback(async () => {
    if (!enabled || !isMountedRef.current) return

    try {
      const res = await apiFetch(`/api/admin/contests/${contestId}`, {
        headers: { 'Cache-Control': 'no-cache' },
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const contestData = await res.json()
      const timestamp = contestData.timestamp || Date.now()

      // Race Condition Prevention: Only update if this is newer
      if (timestamp < lastUpdateRef.current) {
        console.warn('[useContestStream] Ignore stale fetch data', {
          timestamp,
          last: lastUpdateRef.current,
        })
        return
      }
      lastUpdateRef.current = timestamp

      const streamData: ContestStreamData = {
        contest: contestData,
        players: contestData.players || [],
        pokemonPool: contestData.pokemonPool || [],
      }

      updateDataSafe(streamData)
      setError(null)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      onErrorRef.current?.(error)
    }
  }, [contestId, enabled, updateDataSafe])

  // Setup SSE connection
  const connectSSE = useCallback(() => {
    if (!isSSESupported() || !enabled) {
      setStatus('polling')
      return false
    }

    try {
      const eventSource = new EventSource(`/api/contests/${contestId}/stream`)
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        if (!isMountedRef.current) return
        setStatus('connected')
        setError(null)

        // Clear polling if SSE is working
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
      }

      eventSource.onmessage = (event) => {
        if (!isMountedRef.current) return

        try {
          const parsed = JSON.parse(event.data)

          if (parsed.type === 'connected') {
            console.log('[useContestStream] Connected:', parsed.contestId)
            setError(null)
            return
          }

          const timestamp = parsed.timestamp || Date.now()

          // Race Condition Prevention: Only update if this is newer
          if (timestamp < lastUpdateRef.current) {
            console.warn('[useContestStream] Ignore stale SSE data', {
              timestamp,
              last: lastUpdateRef.current,
            })
            return
          }
          lastUpdateRef.current = timestamp

          if (parsed.type === 'partial') {
            // Merge partial data (Optimized update mode)
            // This allows the server to send only dynamic fields (status, price, bid)
            // while we preserve static data (pokemon info, types, etc.)

            const prev = dataRef.current

            // Fallback: If we don't have prev data, we can't do a smart merge.
            // Trigger full fetch.
            if (!prev) {
              console.warn(
                '[useContestStream] Received partial update without previous state, triggering full fetch',
              )
              fetchData()
              return
            }

            // 1. Contest: Simple merge
            const partialContest = parsed.contest || {}
            const newContest = { ...prev.contest, ...partialContest }

            // 2. Players: Replace if provided (Optimized payload includes lightweight player list)
            const newPlayers = parsed.players || prev.players

            // 3. Pokemon Pool: Smart Merge
            // The server sends [{ id, status, ... }] without static 'pokemon' data.
            // We must preserve the existing 'pokemon' object.
            let newPool = prev.pokemonPool
            if (parsed.pokemonPool && Array.isArray(parsed.pokemonPool)) {
              // Create map for O(1) lookup
              const existingMap = new Map(
                prev.pokemonPool.map((p) => [p.id, p]),
              )

              newPool = parsed.pokemonPool.map((newItem: any) => {
                const existing = existingMap.get(newItem.id)
                if (existing) {
                  // Merge: keep existing static data, overwrite with new dynamic data
                  return { ...existing, ...newItem }
                }
                // If it's a completely new item, return as is (should contain full data in that case, or we accept it's bare)
                return newItem
              })
            }

            const mergedData: ContestStreamData = {
              contest: newContest,
              players: newPlayers,
              pokemonPool: newPool,
            }

            updateDataSafe(mergedData)
          } else {
            // Full state update (e.g. initial connection or hard refresh)
            const streamData: ContestStreamData = {
              contest: parsed.contest,
              players: parsed.contest.players || [],
              pokemonPool: parsed.contest.pokemonPool || [],
            }
            updateDataSafe(streamData)
          }

          setError(null)
        } catch (err) {
          console.error('SSE parse error:', err)
        }
      }

      eventSource.onerror = () => {
        if (!isMountedRef.current) return

        console.warn('SSE error, falling back to polling')
        eventSource.close()
        eventSourceRef.current = null
        setStatus('polling')

        // Start polling as fallback
        if (!pollIntervalRef.current) {
          pollIntervalRef.current = setInterval(fetchData, 2000)
        }
      }

      return true
    } catch (err) {
      console.error('Failed to create EventSource:', err)
      setStatus('polling')
      return false
    }
  }, [contestId, enabled, fetchData, updateDataSafe])

  // Initialize connection
  useEffect(() => {
    if (!enabled) {
      setStatus('disconnected')
      return
    }

    isMountedRef.current = true

    // Initial data fetch (Full)
    fetchData()

    // Try SSE first
    const sseConnected = connectSSE()

    // Fall back to polling if SSE not supported or failed
    if (!sseConnected) {
      pollIntervalRef.current = setInterval(fetchData, 2000)
    }

    return () => {
      isMountedRef.current = false

      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }

      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [enabled, fetchData, connectSSE])

  // Stop polling/SSE when contest is completed
  useEffect(() => {
    if (data?.contest?.status === 'COMPLETED') {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }

      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }

      setStatus('disconnected')
    }
  }, [data?.contest?.status])

  return {
    data,
    status,
    error,
    refetch: fetchData,
  }
}
