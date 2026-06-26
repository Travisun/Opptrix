import { useState, useEffect, useCallback } from 'react'

export type Breakpoint = 'mobile' | 'desktop'

const MOBILE_QUERY = '(max-width: 767px)'

function readBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') return 'desktop'
  return window.matchMedia(MOBILE_QUERY).matches ? 'mobile' : 'desktop'
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(readBreakpoint)

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setBp(mq.matches ? 'mobile' : 'desktop')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return bp
}

export function useIsMobile() {
  return useBreakpoint() === 'mobile'
}

const SIDEBAR_KEY = 'inno-sidebar-visible'

/** Desktop: sidebar fully hidden or visible. Mobile: overlay drawer. */
export function useSidebarPreference(isMobile: boolean) {
  const [visible, setVisibleState] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(SIDEBAR_KEY) === 'true'
  })
  const [drawerOpen, setDrawerOpen] = useState(false)

  const setVisible = useCallback((value: boolean) => {
    setVisibleState(value)
    localStorage.setItem(SIDEBAR_KEY, String(value))
  }, [])

  const toggleVisible = useCallback(() => {
    setVisible(!visible)
  }, [visible, setVisible])

  const openDrawer = useCallback(() => setDrawerOpen(true), [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  useEffect(() => {
    if (!isMobile) setDrawerOpen(false)
  }, [isMobile])

  useEffect(() => {
    if (!isMobile || !drawerOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [isMobile, drawerOpen])

  return {
    visible: isMobile ? false : visible,
    drawerOpen,
    setVisible,
    toggleVisible,
    openDrawer,
    closeDrawer,
  }
}
