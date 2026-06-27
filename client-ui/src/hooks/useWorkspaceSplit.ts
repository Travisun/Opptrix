import { useCallback, useEffect, useRef, useState } from 'react'
import {
  WORKSPACE_CHAT_MIN_WIDTH,
  WORKSPACE_RIGHT_PANEL_DEFAULT_WIDTH,
  WORKSPACE_RIGHT_PANEL_MIN_WIDTH,
  WORKSPACE_SPLITTER_WIDTH,
} from '../desktop/constants'

interface Options {
  enabled?: boolean
  defaultRightWidth?: number
}

function clampRightWidth(width: number, wsWidth: number): number {
  const maxRight = wsWidth - WORKSPACE_CHAT_MIN_WIDTH - WORKSPACE_SPLITTER_WIDTH
  const minRight = WORKSPACE_RIGHT_PANEL_MIN_WIDTH
  if (maxRight < minRight) return minRight
  return Math.max(minRight, Math.min(width, maxRight))
}

export function useWorkspaceSplit({
  enabled = true,
  defaultRightWidth = WORKSPACE_RIGHT_PANEL_DEFAULT_WIDTH,
}: Options = {}) {
  const workspaceRef = useRef<HTMLDivElement>(null)
  const [workspaceWidth, setWorkspaceWidth] = useState(0)
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [chatVisible, setChatVisible] = useState(true)
  const [rightPanelWidth, setRightPanelWidth] = useState(defaultRightWidth)
  const [isDragging, setIsDragging] = useState(false)
  const savedRightWidthRef = useRef(defaultRightWidth)
  const rightPanelWidthRef = useRef(defaultRightWidth)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    rightPanelWidthRef.current = rightPanelWidth
  }, [rightPanelWidth])

  useEffect(() => {
    if (!enabled) return
    const el = workspaceRef.current
    if (!el) return

    const sync = () => setWorkspaceWidth(el.clientWidth)
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    return () => observer.disconnect()
  }, [enabled])

  const showSplitter = enabled && chatVisible && rightPanelOpen

  const chatWidth = showSplitter
    ? Math.max(WORKSPACE_CHAT_MIN_WIDTH, workspaceWidth - rightPanelWidth - WORKSPACE_SPLITTER_WIDTH)
    : chatVisible
      ? workspaceWidth
      : 0

  const commitWidth = useCallback((nextWidth: number, wsWidth: number) => {
    const clamped = clampRightWidth(nextWidth, wsWidth)
    savedRightWidthRef.current = clamped
    setRightPanelWidth(clamped)
  }, [])

  const beginDrag = useCallback((clientX: number) => {
    if (!enabled || !chatVisible || !rightPanelOpen) return
    dragRef.current = { startX: clientX, startWidth: rightPanelWidthRef.current }
    setIsDragging(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [chatVisible, enabled, rightPanelOpen])

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
      const ws = workspaceRef.current
      if (!drag || !ws) return

      const delta = drag.startX - e.clientX
      const next = clampRightWidth(drag.startWidth + delta, ws.clientWidth)
      setRightPanelWidth(next)
    }

    const onUp = () => {
      const drag = dragRef.current
      const ws = workspaceRef.current
      endDrag()
      if (drag && ws) {
        commitWidth(rightPanelWidthRef.current, ws.clientWidth)
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      endDrag()
    }
  }, [commitWidth, enabled, endDrag])

  useEffect(() => {
    if (!enabled || isDragging || workspaceWidth <= 0) return
    if (!chatVisible || !rightPanelOpen) return

    const clamped = clampRightWidth(rightPanelWidth, workspaceWidth)
    if (clamped !== rightPanelWidth) {
      commitWidth(clamped, workspaceWidth)
    }
  }, [chatVisible, commitWidth, enabled, isDragging, rightPanelOpen, rightPanelWidth, workspaceWidth])

  const toggleRightPanel = useCallback(() => {
    if (rightPanelOpen) {
      savedRightWidthRef.current = rightPanelWidthRef.current
      setRightPanelOpen(false)
      setChatVisible(true)
      return
    }
    setRightPanelWidth(savedRightWidthRef.current || defaultRightWidth)
    setRightPanelOpen(true)
  }, [defaultRightWidth, rightPanelOpen])

  const toggleChatColumn = useCallback(() => {
    if (!rightPanelOpen) return
    if (chatVisible) {
      savedRightWidthRef.current = rightPanelWidthRef.current
      setChatVisible(false)
      return
    }
    setRightPanelWidth(savedRightWidthRef.current || defaultRightWidth)
    setChatVisible(true)
  }, [chatVisible, defaultRightWidth, rightPanelOpen])

  const canToggleChatColumn = rightPanelOpen

  return {
    workspaceRef,
    workspaceWidth,
    rightPanelOpen,
    chatVisible,
    rightPanelWidth,
    showSplitter,
    chatWidth,
    isDragging,
    canToggleChatColumn,
    beginDrag,
    toggleRightPanel,
    toggleChatColumn,
  }
}
