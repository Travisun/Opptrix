import { useCallback, useEffect, useRef, useState } from 'react'
import type { MessageSelection } from '../types/chat'

export interface MessageSelectionAnchor {
  top: number
  left: number
}

interface Options {
  rootRef: React.RefObject<HTMLElement | null>
  anchorRef: React.RefObject<HTMLElement | null>
  enabled?: boolean
}

const TOOLBAR_HEIGHT = 32
const TOOLBAR_GAP = 6
const TOOLBAR_EST_WIDTH = 152
const VIEWPORT_PAD = 8
const SETTLE_MS = 64

function readSelection(root: HTMLElement): MessageSelection | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null

  const text = sel.toString().trim()
  if (!text) return null

  const range = sel.getRangeAt(0)
  const node = range.commonAncestorContainer
  const el = (node.nodeType === Node.TEXT_NODE ? node.parentElement : node as Element)
  const entry = el?.closest('[data-message-index]') as HTMLElement | null
  if (!entry || !root.contains(entry)) return null

  const index = Number(entry.dataset.messageIndex)
  const role = entry.dataset.messageRole as 'user' | 'assistant' | undefined
  if (!Number.isInteger(index) || (role !== 'user' && role !== 'assistant')) return null

  return { text, messageIndex: index, messageRole: role }
}

function computeAnchorFromRange(anchorRoot: HTMLElement): MessageSelectionAnchor | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null

  const range = sel.getRangeAt(0)
  const rects = range.getClientRects()
  // Multi-line: anchor to the first line so the toolbar stays above the selection start.
  const rect = rects.length > 0 ? rects[0]! : range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null

  const anchorRect = anchorRoot.getBoundingClientRect()

  let left = rect.left + rect.width / 2 - anchorRect.left - TOOLBAR_EST_WIDTH / 2
  left = Math.max(
    VIEWPORT_PAD,
    Math.min(left, anchorRect.width - TOOLBAR_EST_WIDTH - VIEWPORT_PAD),
  )

  const top = Math.max(
    VIEWPORT_PAD,
    rect.top - anchorRect.top - TOOLBAR_HEIGHT - TOOLBAR_GAP,
  )

  return { top, left }
}

export function useMessageSelection({ rootRef, anchorRef, enabled = true }: Options) {
  const [selection, setSelection] = useState<MessageSelection | null>(null)
  const [anchor, setAnchor] = useState<MessageSelectionAnchor | null>(null)
  const draggingRef = useRef(false)
  const settleTimerRef = useRef<number | null>(null)

  const clearSelection = useCallback(() => {
    if (settleTimerRef.current != null) {
      window.clearTimeout(settleTimerRef.current)
      settleTimerRef.current = null
    }
    setSelection(null)
    setAnchor(null)
  }, [])

  const revealSelection = useCallback(() => {
    const root = rootRef.current
    const anchorRoot = anchorRef.current
    if (!enabled || !root || !anchorRoot || draggingRef.current) {
      clearSelection()
      return
    }

    const next = readSelection(root)
    if (!next) {
      clearSelection()
      return
    }

    const nextAnchor = computeAnchorFromRange(anchorRoot)
    if (!nextAnchor) {
      clearSelection()
      return
    }

    setSelection(next)
    setAnchor(nextAnchor)
  }, [anchorRef, clearSelection, enabled, rootRef])

  const scheduleReveal = useCallback(() => {
    if (settleTimerRef.current != null) {
      window.clearTimeout(settleTimerRef.current)
    }
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null
      revealSelection()
    }, SETTLE_MS)
  }, [revealSelection])

  useEffect(() => {
    if (!enabled) {
      clearSelection()
      return
    }

    const onPointerDown = (e: Event) => {
      const target = e.target
      if (target instanceof Element && target.closest('[data-selection-toolbar]')) return
      draggingRef.current = true
      clearSelection()
    }

    const onPointerUp = () => {
      draggingRef.current = false
      scheduleReveal()
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' || e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') {
        scheduleReveal()
      }
    }

    document.addEventListener('mousedown', onPointerDown, true)
    document.addEventListener('mouseup', onPointerUp, true)
    document.addEventListener('touchstart', onPointerDown, { capture: true, passive: true })
    document.addEventListener('touchend', onPointerUp, true)
    document.addEventListener('keyup', onKeyUp)

    return () => {
      document.removeEventListener('mousedown', onPointerDown, true)
      document.removeEventListener('mouseup', onPointerUp, true)
      document.removeEventListener('touchstart', onPointerDown, true)
      document.removeEventListener('touchend', onPointerUp, true)
      document.removeEventListener('keyup', onKeyUp)
      if (settleTimerRef.current != null) {
        window.clearTimeout(settleTimerRef.current)
      }
    }
  }, [clearSelection, enabled, scheduleReveal])

  useEffect(() => {
    const root = rootRef.current
    if (!root || !enabled) return

    const hide = () => clearSelection()
    root.addEventListener('scroll', hide, { passive: true })
    return () => root.removeEventListener('scroll', hide)
  }, [clearSelection, enabled, rootRef])

  return { selection, anchor, clearSelection, syncFromDom: revealSelection }
}
