'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface ProcessingStatus {
  status: string | null  // PENDING, PROCESSING, READY, FAILED
  stage: string | null   // downloading, separating, syncing
  errorMessage: string | null
}

/**
 * Poll processing status for songs that are PENDING or PROCESSING.
 * Stops polling when all songs are READY or FAILED.
 */
export function useProcessingStatus(songIds: string[]) {
  const [statuses, setStatuses] = useState<Map<string, ProcessingStatus>>(new Map())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const pollableIds = songIds.filter((id) => {
    const s = statuses.get(id)
    return !s || s.status === 'PENDING' || s.status === 'PROCESSING'
  })

  const fetchStatuses = useCallback(async () => {
    if (pollableIds.length === 0) return

    const results = await Promise.allSettled(
      pollableIds.map(async (id) => {
        const res = await fetch(`/api/songs/${id}/status`)
        if (!res.ok) return null
        const data = await res.json()
        return { id, ...data } as { id: string } & ProcessingStatus
      })
    )

    setStatuses((prev) => {
      const next = new Map(prev)
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          next.set(result.value.id, {
            status: result.value.status,
            stage: result.value.stage,
            errorMessage: result.value.errorMessage,
          })
        }
      }
      return next
    })
  }, [pollableIds.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pollableIds.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    // Initial fetch
    fetchStatuses()

    // Poll every 3 seconds
    intervalRef.current = setInterval(fetchStatuses, 3000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [pollableIds.length, fetchStatuses])

  return statuses
}
