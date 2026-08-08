import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DESKTOP_SETTINGS_SIDEBAR_WIDTH,
  SETTINGS_CONTENT_MIN_WIDTH,
  SETTINGS_SIDEBAR_MAX_WIDTH,
  SETTINGS_SIDEBAR_MIN_WIDTH,
} from '../desktop/constants'

const SETTINGS_SIDEBAR_WIDTH_KEY = 'opptrix-settings-sidebar-width'

function readStoredWidth(): number {
  if (typeof window === 'undefined') return DESKTOP_SETTINGS_SIDEBAR_WIDTH
  const raw = localStorage.getItem(SETTINGS_SIDEBAR_WIDTH_KEY)
  if (raw == null) return DESKTOP_SETTINGS_SIDEBAR_WIDTH
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return DESKTOP_SETTINGS_SIDEBAR_WIDTH
  return parsed
}

export function clampSettingsSidebarWidth(
  width: number,
  opts: { viewportWidth: number; contentMinWidth?: number },
): number {
  const contentMin = opts.contentMinWidth ?? SETTINGS_CONTENT_MIN_WIDTH
  const dynamicMax = opts.viewportWidth - contentMin
  const max = Math.min(SETTINGS_SIDEBAR_MAX_WIDTH, dynamicMax)
  if (max < SETTINGS_SIDEBAR_MIN_WIDTH) return SETTINGS_SIDEBAR_MIN_WIDTH
  return Math.max(SETTINGS_SIDEBAR_MIN_WIDTH, Math.min(width, max))
}

/** Read persisted settings nav width (clamped) — for chrome layout without owning drag state */
export function getSettingsSidebarWidth(
  viewportWidth: number,
  contentMinWidth = SETTINGS_CONTENT_MIN_WIDTH,
): number {
  return clampSettingsSidebarWidth(readStoredWidth(), { viewportWidth, contentMinWidth })
}

interface Options {
  enabled?: boolean
  viewportWidth: number
  contentMinWidth?: number
}

export function useSettingsSidebarWidth({
  enabled = true,
  viewportWidth,
  contentMinWidth = SETTINGS_CONTENT_MIN_WIDTH,
}: Options) {
  const [width, setWidth] = useState(() => {
    const stored = readStoredWidth()
    if (typeof window === 'undefined') return stored
    return clampSettingsSidebarWidth(stored, {
      viewportWidth: window.innerWidth,
      contentMinWidth,
    })
  })
  const [isDragging, setIsDragging] = useState(false)
  const widthRef = useRef(width)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    widthRef.current = width
  }, [width])

  useEffect(() => {
    if (!enabled || isDragging) return
    const clamped = clampSettingsSidebarWidth(widthRef.current, { viewportWidth, contentMinWidth })
    if (clamped !== widthRef.current) {
      setWidth(clamped)
      localStorage.setItem(SETTINGS_SIDEBAR_WIDTH_KEY, String(clamped))
    }
  }, [contentMinWidth, enabled, isDragging, viewportWidth])

  const commitWidth = useCallback((next: number) => {
    const clamped = clampSettingsSidebarWidth(next, { viewportWidth, contentMinWidth })
    setWidth(clamped)
    localStorage.setItem(SETTINGS_SIDEBAR_WIDTH_KEY, String(clamped))
  }, [contentMinWidth, viewportWidth])

  const beginDrag = useCallback((clientX: number) => {
    if (!enabled) return
    dragRef.current = { startX: clientX, startWidth: widthRef.current }
    setIsDragging(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [enabled])

  const endDrag = useCallback(() => {
    dragRef.current = null
    setIsDragging(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  useEffect(() => {
    if (!enabled) return

    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const delta = e.clientX - drag.startX
      const next = clampSettingsSidebarWidth(drag.startWidth + delta, {
        viewportWidth,
        contentMinWidth,
      })
      setWidth(next)
    }

    const onUp = () => {
      const hadDrag = dragRef.current != null
      endDrag()
      if (hadDrag) {
        commitWidth(widthRef.current)
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      endDrag()
    }
  }, [commitWidth, contentMinWidth, enabled, endDrag, viewportWidth])

  return { width, isDragging, beginDrag }
}
