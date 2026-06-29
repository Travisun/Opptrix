import { useCallback, useEffect, useRef, useState } from 'react'
import { getStockPrep, startStockPrep } from '../api/client'
import type { StockPrepSnapshot } from '../types/schemas'

const POLL_MS = 1500

export function useStockPrep(code: string | null) {
  const [prep, setPrep] = useState<StockPrepSnapshot | null>(null)
  const pollRef = useRef<number | null>(null)

  const stopPoll = useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const beginPoll = useCallback(() => {
    stopPoll()
    pollRef.current = window.setInterval(() => {
      void getStockPrep(code!).then(resp => {
        setPrep(resp.prep)
        if (resp.prep.status !== 'running') stopPoll()
      }).catch(() => {})
    }, POLL_MS)
  }, [code, stopPoll])

  const refresh = useCallback(async (force = false) => {
    if (!code) return
    try {
      const resp = await startStockPrep(code, force)
      setPrep(resp.prep)
      if (resp.prep.status === 'running') beginPoll()
    } catch {
      /* ignore */
    }
  }, [code, beginPoll])

  useEffect(() => {
    if (!code) {
      setPrep(null)
      stopPoll()
      return undefined
    }

    let cancelled = false
    void (async () => {
      try {
        const resp = await startStockPrep(code)
        if (cancelled) return
        setPrep(resp.prep)
        if (resp.prep.status === 'running') beginPoll()
      } catch {
        /* ignore */
      }
    })()

    return () => {
      cancelled = true
      stopPoll()
    }
  }, [code, beginPoll, stopPoll])

  return { prep, refresh }
}
