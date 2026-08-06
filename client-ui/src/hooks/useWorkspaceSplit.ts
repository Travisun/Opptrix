import { useCallback, useEffect, useRef, useState } from 'react'
import {
  WORKSPACE_CHAT_MIN_WIDTH,
  WORKSPACE_CHAT_RIGHT_MIN_WIDTH,
  WORKSPACE_PREVIEW_PANEL_DEFAULT_WIDTH,
  WORKSPACE_PREVIEW_PANEL_MIN_WIDTH,
  WORKSPACE_RIGHT_PANEL_DEFAULT_WIDTH,
  WORKSPACE_RIGHT_PANEL_MIN_WIDTH,
  WORKSPACE_RIGHT_PANEL_RESTORE_WIDTH,
  WORKSPACE_SPLITTER_WIDTH,
} from '../desktop/constants'
import { ensureWindowContentWidth } from '../platform/ensureWindowContentWidth'

interface Options {
  enabled?: boolean
  defaultRightWidth?: number
  previewDefaultWidth?: number
  previewMinWidth?: number
}

function clampRightWidth(width: number, wsWidth: number, minWidth: number): number {
  const maxRight = wsWidth - WORKSPACE_CHAT_MIN_WIDTH - WORKSPACE_SPLITTER_WIDTH
  if (maxRight < minWidth) return minWidth
  return Math.max(minWidth, Math.min(width, maxRight))
}

export function useWorkspaceSplit({
  enabled = true,
  defaultRightWidth = WORKSPACE_RIGHT_PANEL_DEFAULT_WIDTH,
  previewDefaultWidth = WORKSPACE_PREVIEW_PANEL_DEFAULT_WIDTH,
  previewMinWidth = WORKSPACE_PREVIEW_PANEL_MIN_WIDTH,
}: Options = {}) {
  const workspaceRef = useRef<HTMLDivElement>(null)
  const [workspaceWidth, setWorkspaceWidth] = useState(0)
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [chatVisible, setChatVisible] = useState(true)
  const [rightPanelWidth, setRightPanelWidth] = useState(defaultRightWidth)
  const [mode, setMode] = useState<'market' | 'preview'>('market')
  const [isDragging, setIsDragging] = useState(false)
  const savedRightWidthRef = useRef(defaultRightWidth)
  const savedPreviewWidthRef = useRef(0)
  const rightPanelWidthRef = useRef(defaultRightWidth)
  const modeRef = useRef<'market' | 'preview'>('market')
  const autoCollapsedByWidthRef = useRef(false)
  /** Skip auto-collapse while we widen the window to fit an intentional open. */
  const expandForOpenRef = useRef(false)
  const expandForOpenTimerRef = useRef<number | null>(null)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const clearExpandForOpen = useCallback(() => {
    expandForOpenRef.current = false
    if (expandForOpenTimerRef.current != null) {
      window.clearTimeout(expandForOpenTimerRef.current)
      expandForOpenTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    rightPanelWidthRef.current = rightPanelWidth
  }, [rightPanelWidth])

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => () => clearExpandForOpen(), [clearExpandForOpen])

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

  const canFitRightPanel = workspaceWidth <= 0 || workspaceWidth >= WORKSPACE_CHAT_RIGHT_MIN_WIDTH

  const commitWidth = useCallback((nextWidth: number, wsWidth: number) => {
    const minWidth =
      modeRef.current === 'preview' ? previewMinWidth : WORKSPACE_RIGHT_PANEL_MIN_WIDTH
    const clamped = clampRightWidth(nextWidth, wsWidth, minWidth)
    if (modeRef.current === 'preview') {
      savedPreviewWidthRef.current = clamped
    } else {
      savedRightWidthRef.current = clamped
    }
    setRightPanelWidth(clamped)
  }, [previewMinWidth])

  const collapseRightPanel = useCallback((markAuto = true) => {
    if (!rightPanelOpen) return
    if (modeRef.current === 'preview') {
      savedPreviewWidthRef.current = rightPanelWidthRef.current
    } else {
      savedRightWidthRef.current = rightPanelWidthRef.current
    }
    if (markAuto) autoCollapsedByWidthRef.current = true
    setRightPanelOpen(false)
    setChatVisible(true)
  }, [rightPanelOpen])

  const closePreview = useCallback(() => {
    if (modeRef.current === 'preview') {
      savedPreviewWidthRef.current = rightPanelWidthRef.current
      setMode('market')
    }
    collapseRightPanel()
  }, [collapseRightPanel])

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
      const minWidth =
        modeRef.current === 'preview' ? previewMinWidth : WORKSPACE_RIGHT_PANEL_MIN_WIDTH
      const next = clampRightWidth(drag.startWidth + delta, ws.clientWidth, minWidth)
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
  }, [commitWidth, enabled, endDrag, previewMinWidth])

  useEffect(() => {
    if (!enabled || isDragging || workspaceWidth <= 0) return

    if (expandForOpenRef.current && workspaceWidth >= WORKSPACE_CHAT_RIGHT_MIN_WIDTH) {
      clearExpandForOpen()
    }

    if (rightPanelOpen && workspaceWidth < WORKSPACE_CHAT_RIGHT_MIN_WIDTH) {
      if (expandForOpenRef.current) return
      collapseRightPanel(true)
      return
    }

    if (
      !rightPanelOpen
      && autoCollapsedByWidthRef.current
      && workspaceWidth >= WORKSPACE_RIGHT_PANEL_RESTORE_WIDTH
    ) {
      autoCollapsedByWidthRef.current = false
      const restored =
        modeRef.current === 'preview'
          ? savedPreviewWidthRef.current || previewDefaultWidth
          : savedRightWidthRef.current || defaultRightWidth
      setRightPanelWidth(restored)
      setRightPanelOpen(true)
      setChatVisible(true)
      return
    }

    if (!rightPanelOpen || !chatVisible) return

    const clamped = clampRightWidth(
      rightPanelWidth,
      workspaceWidth,
      mode === 'preview' ? previewMinWidth : WORKSPACE_RIGHT_PANEL_MIN_WIDTH,
    )
    if (clamped !== rightPanelWidth) {
      commitWidth(clamped, workspaceWidth)
    }
  }, [
    chatVisible,
    clearExpandForOpen,
    collapseRightPanel,
    commitWidth,
    defaultRightWidth,
    enabled,
    isDragging,
    mode,
    previewDefaultWidth,
    previewMinWidth,
    rightPanelOpen,
    rightPanelWidth,
    workspaceWidth,
  ])

  const openWithWidth = useCallback((targetWidth: number) => {
    const neededWorkspace =
      WORKSPACE_CHAT_MIN_WIDTH + WORKSPACE_SPLITTER_WIDTH + targetWidth

    const openPanel = () => {
      autoCollapsedByWidthRef.current = false
      setRightPanelWidth(targetWidth)
      setRightPanelOpen(true)
      setChatVisible(true)
    }

    if (enabled && workspaceWidth > 0 && workspaceWidth < neededWorkspace) {
      const deficit = neededWorkspace - workspaceWidth
      expandForOpenRef.current = true
      if (expandForOpenTimerRef.current != null) {
        window.clearTimeout(expandForOpenTimerRef.current)
      }
      // If resize is blocked (fullscreen / OS limits), stop shielding auto-collapse.
      expandForOpenTimerRef.current = window.setTimeout(() => {
        expandForOpenRef.current = false
        expandForOpenTimerRef.current = null
      }, 1000)

      void ensureWindowContentWidth(window.innerWidth + deficit).finally(openPanel)
      return
    }

    openPanel()
  }, [enabled, workspaceWidth])

  const toggleRightPanel = useCallback(() => {
    if (mode === 'preview') {
      savedPreviewWidthRef.current = rightPanelWidthRef.current
      setMode('market')
      openWithWidth(savedRightWidthRef.current || defaultRightWidth)
      return
    }

    if (rightPanelOpen) {
      clearExpandForOpen()
      savedRightWidthRef.current = rightPanelWidthRef.current
      autoCollapsedByWidthRef.current = false
      setRightPanelOpen(false)
      setChatVisible(true)
      return
    }

    openWithWidth(savedRightWidthRef.current || defaultRightWidth)
  }, [clearExpandForOpen, defaultRightWidth, mode, openWithWidth, rightPanelOpen])

  const openPreview = useCallback(() => {
    if (mode === 'market') {
      savedRightWidthRef.current = rightPanelWidthRef.current
    }
    setMode('preview')
    openWithWidth(savedPreviewWidthRef.current || previewDefaultWidth)
  }, [mode, openWithWidth, previewDefaultWidth])

  const openMarket = useCallback(() => {
    if (mode === 'preview') {
      savedPreviewWidthRef.current = rightPanelWidthRef.current
    }
    setMode('market')
    openWithWidth(savedRightWidthRef.current || defaultRightWidth)
  }, [defaultRightWidth, mode, openWithWidth])

  const toggleChatColumn = useCallback(() => {
    if (!rightPanelOpen) return
    if (chatVisible) {
      if (modeRef.current === 'preview') {
        savedPreviewWidthRef.current = rightPanelWidthRef.current
      } else {
        savedRightWidthRef.current = rightPanelWidthRef.current
      }
      setChatVisible(false)
      return
    }
    const restored =
      modeRef.current === 'preview'
        ? savedPreviewWidthRef.current || previewDefaultWidth
        : savedRightWidthRef.current || defaultRightWidth
    setRightPanelWidth(restored)
    setChatVisible(true)
  }, [chatVisible, defaultRightWidth, previewDefaultWidth, rightPanelOpen])

  const canToggleChatColumn = rightPanelOpen

  return {
    workspaceRef,
    workspaceWidth,
    rightPanelOpen,
    chatVisible,
    rightPanelWidth,
    mode,
    showSplitter,
    chatWidth,
    isDragging,
    canToggleChatColumn,
    canFitRightPanel,
    beginDrag,
    collapseRightPanel,
    closePreview,
    toggleRightPanel,
    toggleChatColumn,
    openPreview,
    openMarket,
  }
}
