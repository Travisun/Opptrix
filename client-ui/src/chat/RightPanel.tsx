import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type TransitionEvent,
} from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  DESKTOP_SIDEBAR_LAYOUT_EASE,
  DESKTOP_SIDEBAR_LAYOUT_MS,
  DESKTOP_TITLEBAR_HEIGHT,
  RIGHT_PANEL_PEER_SLIDE_EASE,
  RIGHT_PANEL_PEER_SLIDE_MS,
  WORKSPACE_RIGHT_PANEL_DEFAULT_WIDTH,
} from '../desktop/constants'
import type { ChatAttachmentMeta } from '../types/chat'
import RightMarketPanel from '../market/RightMarketPanel'
import FilePreviewPanel, { type FilePreviewTarget } from './FilePreviewPanel'
import type { StockDiscussPayload } from '../market/StockDecisionCard'

const PEER_SLIDE_FALLBACK_BUFFER_MS = 48

const useStyles = makeStyles({
  panelShell: {
    flexShrink: 0,
    width: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    display: 'flex',
    flexDirection: 'column',
    /**
     * Keep content left-aligned inside the shell.
     * The shell sits on the trailing edge and grows leftward (chat is flex:1),
     * so left-aligned clip reads as one panel pulled from the right.
     * flex-end would reveal the panel's right edge first and make inner content
     * look like a second slide-in from the left (especially noticeable on macOS).
     */
    alignItems: 'flex-start',
    minHeight: 0,
    height: '100%',
    transitionProperty: 'width',
    transitionDuration: `${DESKTOP_SIDEBAR_LAYOUT_MS}ms`,
    transitionTimingFunction: DESKTOP_SIDEBAR_LAYOUT_EASE,
  },
  panelShellOpen: {
    pointerEvents: 'auto',
  },
  panelShellNoTransition: {
    transitionProperty: 'none',
  },
  panelShellPeerMorph: {
    transitionDuration: `${RIGHT_PANEL_PEER_SLIDE_MS}ms`,
    transitionTimingFunction: RIGHT_PANEL_PEER_SLIDE_EASE,
  },
  panelShellElectron: {
    marginTop: `-${DESKTOP_TITLEBAR_HEIGHT}px`,
    height: `calc(100% + ${DESKTOP_TITLEBAR_HEIGHT}px)`,
    boxSizing: 'border-box',
  },
  panel: {
    height: '100%',
    minHeight: 0,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    overflow: 'hidden',
    transitionProperty: 'width, min-width',
    transitionDuration: `${DESKTOP_SIDEBAR_LAYOUT_MS}ms`,
    transitionTimingFunction: DESKTOP_SIDEBAR_LAYOUT_EASE,
  },
  panelNoTransition: {
    transitionProperty: 'none',
  },
  panelPeerMorph: {
    transitionDuration: `${RIGHT_PANEL_PEER_SLIDE_MS}ms`,
    transitionTimingFunction: RIGHT_PANEL_PEER_SLIDE_EASE,
  },
  track: {
    display: 'flex',
    width: '200%',
    height: '100%',
    minHeight: 0,
    flexShrink: 0,
    transform: 'translate3d(-50%, 0, 0)',
    transitionProperty: 'transform',
    transitionDuration: `${RIGHT_PANEL_PEER_SLIDE_MS}ms`,
    transitionTimingFunction: RIGHT_PANEL_PEER_SLIDE_EASE,
  },
  trackPreview: {
    transform: 'translate3d(0, 0, 0)',
  },
  trackNoTransition: {
    transitionProperty: 'none',
  },
  trackSliding: {
    willChange: 'transform',
  },
  trackReducedMotion: {
    '@media (prefers-reduced-motion: reduce)': {
      transitionProperty: 'none',
    },
  },
  pane: {
    flex: '0 0 50%',
    width: '50%',
    height: '100%',
    minHeight: 0,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
  },
  paneOffscreen: {
    pointerEvents: 'none',
  },
})

interface Props {
  visible: boolean
  width?: number
  fullWidth?: boolean
  transitionEnabled?: boolean
  electronChrome?: boolean
  chatColumnVisible?: boolean
  chromeToolbarReserve?: number
  focusStockCode?: string | null
  onFocusStockConsumed?: () => void
  onToggleRightPanel?: () => void
  onToggleChatColumn?: () => void
  onDiscussInChat?: (payload: StockDiscussPayload) => void
  /** 右侧处于文件预览模式（可无已选附件，显示空状态） */
  previewMode?: boolean
  preview?: FilePreviewTarget | null
  /** 空预览时用当前会话 id（preview.sessionId 可能为空） */
  previewSessionId?: string | null
  onSelectAttachment?: (attachment: ChatAttachmentMeta) => void
  onClosePreview?: () => void
  onSlideTransitionEnd?: () => void
}

function RightPanel({
  visible,
  width = WORKSPACE_RIGHT_PANEL_DEFAULT_WIDTH,
  fullWidth = false,
  transitionEnabled = true,
  electronChrome = false,
  chatColumnVisible = true,
  chromeToolbarReserve = 0,
  focusStockCode = null,
  onFocusStockConsumed,
  onToggleRightPanel,
  onToggleChatColumn,
  onDiscussInChat,
  previewMode = false,
  preview = null,
  previewSessionId = null,
  onSelectAttachment,
  onClosePreview,
  onSlideTransitionEnd,
}: Props) {
  const s = useStyles()
  const showPreview = previewMode || preview != null
  /** 仅当 preview 属于当前会话时才展示附件；否则用当前 session 的文件列表/空态 */
  const previewBelongsToActive = Boolean(
    preview?.sessionId
    && previewSessionId
    && preview.sessionId === previewSessionId,
  )
  const previewSid = previewSessionId || undefined
  const previewAttachment = previewBelongsToActive ? (preview?.attachment ?? null) : null

  const prevVisibleRef = useRef(visible)
  const prevPreviewModeRef = useRef(previewMode)
  const isPeerSlidingRef = useRef(false)
  const slideFallbackTimerRef = useRef<number | null>(null)
  const visualPreviewRafRef = useRef<number | null>(null)
  const onSlideTransitionEndRef = useRef(onSlideTransitionEnd)
  const [isPeerSliding, setIsPeerSliding] = useState(false)
  /** Drives track transform; decoupled from previewMode during peer slide to avoid first-frame jump */
  const [visualPreviewMode, setVisualPreviewMode] = useState(previewMode)

  useEffect(() => {
    onSlideTransitionEndRef.current = onSlideTransitionEnd
  }, [onSlideTransitionEnd])

  const clearSlideFallback = useCallback(() => {
    if (slideFallbackTimerRef.current != null) {
      window.clearTimeout(slideFallbackTimerRef.current)
      slideFallbackTimerRef.current = null
    }
  }, [])

  const cancelVisualPreviewRaf = useCallback(() => {
    if (visualPreviewRafRef.current != null) {
      window.cancelAnimationFrame(visualPreviewRafRef.current)
      visualPreviewRafRef.current = null
    }
  }, [])

  const finishPeerSlide = useCallback(() => {
    if (!isPeerSlidingRef.current) return
    clearSlideFallback()
    isPeerSlidingRef.current = false
    setIsPeerSliding(false)
    onSlideTransitionEndRef.current?.()
  }, [clearSlideFallback])

  useEffect(() => {
    isPeerSlidingRef.current = isPeerSliding
  }, [isPeerSliding])

  useLayoutEffect(() => {
    const panelWasOpen = visible && prevVisibleRef.current
    const previewModeChanged = previewMode !== prevPreviewModeRef.current

    prevVisibleRef.current = visible
    prevPreviewModeRef.current = previewMode

    if (!previewModeChanged) return

    if (!panelWasOpen) {
      cancelVisualPreviewRaf()
      setVisualPreviewMode(previewMode)
      return
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!transitionEnabled || reducedMotion) {
      cancelVisualPreviewRaf()
      setVisualPreviewMode(previewMode)
      onSlideTransitionEndRef.current?.()
      return
    }

    // Phase 1 (before paint): latch transition on; keep visualPreviewMode at previous transform
    isPeerSlidingRef.current = true
    setIsPeerSliding(true)
    clearSlideFallback()
    slideFallbackTimerRef.current = window.setTimeout(() => {
      slideFallbackTimerRef.current = null
      finishPeerSlide()
    }, RIGHT_PANEL_PEER_SLIDE_MS + PEER_SLIDE_FALLBACK_BUFFER_MS)

    // Phase 2 (next frame): apply target transform so CSS transition runs from old → new
    cancelVisualPreviewRaf()
    visualPreviewRafRef.current = window.requestAnimationFrame(() => {
      visualPreviewRafRef.current = null
      setVisualPreviewMode(previewMode)
    })
  }, [
    visible,
    previewMode,
    transitionEnabled,
    clearSlideFallback,
    finishPeerSlide,
    cancelVisualPreviewRaf,
  ])

  useEffect(() => () => {
    clearSlideFallback()
    cancelVisualPreviewRaf()
  }, [clearSlideFallback, cancelVisualPreviewRaf])

  const handleTrackTransitionEnd = useCallback((e: TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.propertyName !== 'transform') return
    finishPeerSlide()
  }, [finishPeerSlide])

  const shellWidth = !visible
    ? 0
    : fullWidth
      ? '100%'
      : width

  const previewPaneActive = visible && previewMode
  const marketPaneActive = visible && !previewMode
  /** Keep both panes awake during peer slide so subscriptions don't churn mid-animation */
  const previewPaneAwake = visible && (previewMode || isPeerSliding)
  const marketPaneAwake = visible && (!previewMode || isPeerSliding)
  const trackTransitionEnabled = transitionEnabled && isPeerSliding

  return (
    <div
      className={mergeClasses(
        s.panelShell,
        visible && s.panelShellOpen,
        !transitionEnabled && s.panelShellNoTransition,
        isPeerSliding && s.panelShellPeerMorph,
        electronChrome && s.panelShellElectron,
      )}
      style={{ width: typeof shellWidth === 'number' ? `${shellWidth}px` : shellWidth }}
    >
      <aside
        className={mergeClasses(
          s.panel,
          'opptrix-right-panel',
          !transitionEnabled && s.panelNoTransition,
          isPeerSliding && s.panelPeerMorph,
        )}
        style={fullWidth
          ? { width: '100%' }
          : { width: `${width}px`, minWidth: `${width}px` }}
        aria-label={showPreview ? '文件预览' : '行情与自选'}
        aria-hidden={!visible}
      >
        <div
          className={mergeClasses(
            s.track,
            visualPreviewMode && s.trackPreview,
            !trackTransitionEnabled && s.trackNoTransition,
            isPeerSliding && s.trackSliding,
            s.trackReducedMotion,
          )}
          onTransitionEnd={handleTrackTransitionEnd}
        >
          <div
            className={mergeClasses(s.pane, !previewPaneActive && s.paneOffscreen)}
            aria-hidden={!previewPaneActive}
          >
            <FilePreviewPanel
              sessionId={previewSid}
              attachment={previewAttachment}
              panelVisible={previewPaneAwake}
              onClose={onClosePreview ?? (() => {})}
              onSelectAttachment={onSelectAttachment}
              electronChrome={electronChrome}
              chatColumnVisible={chatColumnVisible}
              chromeToolbarReserve={chromeToolbarReserve}
              panelFullWidth={fullWidth}
            />
          </div>
          <div
            className={mergeClasses(s.pane, !marketPaneActive && s.paneOffscreen)}
            aria-hidden={!marketPaneActive}
          >
            <RightMarketPanel
              panelVisible={marketPaneAwake}
              electronChrome={electronChrome}
              chatColumnVisible={chatColumnVisible}
              chromeToolbarReserve={chromeToolbarReserve}
              panelFullWidth={fullWidth}
              focusStockCode={focusStockCode}
              onFocusStockConsumed={onFocusStockConsumed}
              onToggleRightPanel={visible ? onToggleRightPanel : undefined}
              onToggleChatColumn={visible ? onToggleChatColumn : undefined}
              onDiscussInChat={visible ? onDiscussInChat : undefined}
            />
          </div>
        </div>
      </aside>
    </div>
  )
}

export default memo(RightPanel)
