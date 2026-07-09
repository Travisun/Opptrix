import { useEffect, useRef, useState, type RefObject } from 'react'

export type MarketLayoutMode = 'stacked' | 'split'

const STACK_MAX = 759

export function useMarketDynamicsLayout(containerRef: RefObject<HTMLElement | null>): MarketLayoutMode {
  const [mode, setMode] = useState<MarketLayoutMode>(() => {
    if (typeof window === 'undefined') return 'split'
    return window.innerWidth <= STACK_MAX ? 'stacked' : 'split'
  })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    const sync = () => {
      setMode(el.clientWidth <= STACK_MAX ? 'stacked' : 'split')
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef])

  return mode
}
