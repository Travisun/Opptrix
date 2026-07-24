import { useState, useEffect, useCallback, useRef } from 'react'
import { isDesktopApp } from '../platform/detect'
import {
  SIDEBAR_EXPAND_MULTIPLIER,
  SIDEBAR_OVERLAY_MULTIPLIER,
} from '../desktop/constants'

export type Breakpoint = 'mobile' | 'desktop'

const MOBILE_QUERY = '(max-width: 767px)'

export function sidebarOverlayThreshold(sidebarWidth: number): number {
  return sidebarWidth * SIDEBAR_OVERLAY_MULTIPLIER
}

export function sidebarExpandThreshold(sidebarWidth: number): number {
  return sidebarWidth * SIDEBAR_EXPAND_MULTIPLIER
}

function readBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') return 'desktop'
  if (isDesktopApp()) return 'desktop'
  return window.matchMedia(MOBILE_QUERY).matches ? 'mobile' : 'desktop'
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(readBreakpoint)

  useEffect(() => {
    // Desktop shell (Electron) always uses desktop layout regardless of window width
    if (isDesktopApp()) return undefined

    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setBp(mq.matches ? 'mobile' : 'desktop')
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return bp
}

export function useIsMobile() {
  return useBreakpoint() === 'mobile'
}

const SIDEBAR_KEY = 'opptrix-sidebar-visible'

function isOverlayDesktop(sidebarWidth: number): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth < sidebarOverlayThreshold(sidebarWidth)
}

function shouldAutoExpandSidebar(sidebarWidth: number): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth >= sidebarExpandThreshold(sidebarWidth)
}

/** Collapse on shrink into overlay; expand when growing past 3× sidebar width. */
export function useSidebarResizeSync(
  enabled: boolean,
  sidebarWidth: number,
  onCollapse: () => void,
  onExpand: () => void,
) {
  const prevWidthRef = useRef(
    typeof window !== 'undefined' ? window.innerWidth : sidebarExpandThreshold(sidebarWidth),
  )
  const onCollapseRef = useRef(onCollapse)
  const onExpandRef = useRef(onExpand)
  onCollapseRef.current = onCollapse
  onExpandRef.current = onExpand

  const overlayThreshold = sidebarOverlayThreshold(sidebarWidth)
  const expandThreshold = sidebarExpandThreshold(sidebarWidth)

  useEffect(() => {
    if (!enabled) return undefined

    const onResize = () => {
      const w = window.innerWidth
      const prev = prevWidthRef.current

      if (w < overlayThreshold && prev >= overlayThreshold) {
        onCollapseRef.current()
      }
      if (w >= expandThreshold && prev < expandThreshold) {
        onExpandRef.current()
      }

      prevWidthRef.current = w
    }

    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [enabled, overlayThreshold, expandThreshold])
}

/** True when session sidebar should float over content instead of pushing layout. */
export function useSidebarOverlayMode(enabled: boolean, sidebarWidth: number) {
  const [overlayMode, setOverlayMode] = useState(() => enabled && isOverlayDesktop(sidebarWidth))

  useEffect(() => {
    if (!enabled) {
      setOverlayMode(false)
      return undefined
    }

    const onResize = () => setOverlayMode(isOverlayDesktop(sidebarWidth))
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [enabled, sidebarWidth])

  return overlayMode
}

/** Desktop: sidebar panel or overlay. Mobile: overlay drawer. */
export function useSidebarPreference(isMobile: boolean, sidebarWidth: number) {
  const [userVisible, setUserVisibleState] = useState(() => {
    if (typeof window === 'undefined') return false
    if (isDesktopApp()) {
      return shouldAutoExpandSidebar(sidebarWidth)
    }
    // Web 桌面没有 Electron 标题栏里的侧栏展开按钮；宽屏下默认展开，避免用户被隐藏偏好卡住。
    if (!window.matchMedia(MOBILE_QUERY).matches) {
      return shouldAutoExpandSidebar(sidebarWidth)
    }
    return localStorage.getItem(SIDEBAR_KEY) === 'true' || localStorage.getItem('inno-sidebar-visible') === 'true'
  })
  const [drawerOpen, setDrawerOpen] = useState(false)

  const setVisible = useCallback((value: boolean) => {
    setUserVisibleState(value)
    localStorage.setItem(SIDEBAR_KEY, String(value))
  }, [])

  const toggleVisible = useCallback(() => {
    if (isMobile) {
      setDrawerOpen(prev => !prev)
      return
    }
    setVisible(!userVisible)
  }, [isMobile, userVisible, setVisible])

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
    visible: !isMobile && userVisible,
    drawerOpen,
    setVisible,
    toggleVisible,
    openDrawer,
    closeDrawer,
  }
}
