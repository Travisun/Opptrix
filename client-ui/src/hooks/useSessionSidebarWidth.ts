import { useCallback, useEffect, useRef, useState } from 'react'
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from '../desktop/constants'

const SIDEBAR_WIDTH_KEY = 'opptrix-sidebar-width'

function readStoredWidth(): number {
  if (typeof window === 'undefined') return SIDEBAR_DEFAULT_WIDTH
  const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY)
  if (raw == null) return SIDEBAR_DEFAULT_WIDTH
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return SIDEBAR_DEFAULT_WIDTH
  return parsed
}

/** Read persisted sidebar width, clamped to viewport — for overlay threshold without drag hook */
export function getSessionSidebarWidth(
  viewportWidth: number,
  workspaceMinWidth: number,
): number {
  return clampSessionSidebarWidth(readStoredWidth(), { viewportWidth, workspaceMinWidth })
}

export function clampSessionSidebarWidth(
  width: number,
  opts: { viewportWidth: number; workspaceMinWidth: number },
): number {
  const dynamicMax = opts.viewportWidth - opts.workspaceMinWidth
  const max = Math.min(SIDEBAR_MAX_WIDTH, dynamicMax)
  if (max < SIDEBAR_MIN_WIDTH) return SIDEBAR_MIN_WIDTH
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(width, max))
}

interface Options {
  enabled?: boolean
  viewportWidth: number
  workspaceMinWidth: number
}

export function useSessionSidebarWidth({
  enabled = true,
  viewportWidth,
  workspaceMinWidth,
}: Options) {
  const [width, setWidth] = useState(() => {
    const stored = readStoredWidth()
    if (typeof window === 'undefined') return stored
    return clampSessionSidebarWidth(stored, {
      viewportWidth: window.innerWidth,
      workspaceMinWidth,
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
    const clamped = clampSessionSidebarWidth(widthRef.current, { viewportWidth, workspaceMinWidth })
    if (clamped !== widthRef.current) {
      setWidth(clamped)
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped))
    }
  }, [enabled, isDragging, viewportWidth, workspaceMinWidth])

  const commitWidth = useCallback((next: number) => {
    const clamped = clampSessionSidebarWidth(next, { viewportWidth, workspaceMinWidth })
    setWidth(clamped)
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped))
  }, [viewportWidth, workspaceMinWidth])

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
      const next = clampSessionSidebarWidth(drag.startWidth + delta, {
        viewportWidth,
        workspaceMinWidth,
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
  }, [commitWidth, enabled, endDrag, viewportWidth, workspaceMinWidth])

  return { width, isDragging, beginDrag }
}
