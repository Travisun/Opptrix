import { createPortal } from 'react-dom'
import { cloneElement, isValidElement, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  ArrowLeftRegular,
  ArrowRightRegular,
} from '@fluentui/react-icons'
import { makeStyles, mergeClasses, Text } from '@fluentui/react-components'
import { isElectron } from '../platform/detect'
import {
  DESKTOP_SIDEBAR_LAYOUT_EASE,
  DESKTOP_SIDEBAR_LAYOUT_MS,
  DESKTOP_SIDEBAR_TOOL_ICON_PADDING,
  DESKTOP_SIDEBAR_TOOL_ICON_SIZE,
  DESKTOP_TITLEBAR_HEIGHT,
  DESKTOP_TOOL_GAP,
  DESKTOP_TOOL_ICON_SIZE,
  DESKTOP_Z_CHROME_TOOLS,
  DESKTOP_NEWS_TITLE_DRAG_CLIP_DARWIN,
  DESKTOP_NEWS_TITLE_DRAG_CLIP_WIN,
  SIDEBAR_INLINE_WIDTH,
  DESKTOP_TITLE_BAR_ACTIONS_WIDTH,
} from './constants'
import {
  PanelLeftContractRegular,
  PanelLeftExpandRegular,
  PanelRightExpandRegular,
  ChatAddRegular,
  ArrowMaximizeRegular,
  ArrowMinimizeRegular,
} from '../chat/chatIcons'
import { electronPlatform } from '../platform/detect'
import { opptrixCssVars } from '../theme/tokens'
import {
  desktopChromeBandHeight,
  desktopChromeTopOffset,
  desktopTitleBarActionsRight,
  desktopTitleLeft,
  desktopTitleMaxWidth,
  desktopToolbarLeft,
  type DesktopViewMode,
} from './layout'
import ChromeToolButton from './ChromeToolButton'
import AppUpdateChromeHint from './AppUpdateChromeHint'
import WindowControls from './WindowControls'
import { useElectronFullscreen } from '../hooks/useElectronFullscreen'

const useStyles = makeStyles({
  chromeBar: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    height: `${DESKTOP_TITLEBAR_HEIGHT}px`,
    zIndex: DESKTOP_Z_CHROME_TOOLS,
    pointerEvents: 'none',
  },
  drag: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    WebkitAppRegion: 'drag',
    pointerEvents: 'auto',
  },
  toolbar: {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    gap: `${DESKTOP_TOOL_GAP}px`,
    pointerEvents: 'auto',
    WebkitAppRegion: 'no-drag',
    zIndex: 4,
    transitionProperty: 'left',
    transitionDuration: `${DESKTOP_SIDEBAR_LAYOUT_MS}ms`,
    transitionTimingFunction: DESKTOP_SIDEBAR_LAYOUT_EASE,
  },
  title: {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    pointerEvents: 'none',
    WebkitAppRegion: 'drag',
    zIndex: 2,
    transitionProperty: 'left, max-width',
    transitionDuration: `${DESKTOP_SIDEBAR_LAYOUT_MS}ms`,
    transitionTimingFunction: DESKTOP_SIDEBAR_LAYOUT_EASE,
  },
  titleInteractive: {
    zIndex: 5,
  },
  titleSlotWrap: {
    display: 'inline-flex',
    alignItems: 'center',
    minWidth: 0,
    maxWidth: '100%',
    pointerEvents: 'auto',
    WebkitAppRegion: 'no-drag',
  },
  titleText: {
    fontSize: '13px',
    fontWeight: 500,
    color: opptrixCssVars.textPrimary,
    letterSpacing: '-0.01em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: '100%',
  },
  titleBarActions: {
    position: 'fixed',
    display: 'flex',
    alignItems: 'center',
    gap: `${DESKTOP_TOOL_GAP}px`,
    pointerEvents: 'auto',
    WebkitAppRegion: 'no-drag',
    zIndex: DESKTOP_Z_CHROME_TOOLS,
  },
})

interface DesktopWindowChromeProps {
  title: string
  /** 可点击标题与工具菜单；未提供时使用纯文本标题 */
  titleSlot?: ReactNode
  viewMode?: DesktopViewMode
  sidebarOpen?: boolean
  sidebarInline?: boolean
  showSidebarToggle?: boolean
  sidebarHoverReveal?: boolean
  canGoBack?: boolean
  canGoForward?: boolean
  onToggleSidebar?: () => void
  onRevealSidebar?: () => void
  onNewChat?: () => void
  onGoBack?: () => void
  onGoForward?: () => void
  rightPanelOpen?: boolean
  rightPanelWidth?: number
  chatColumnWidth?: number
  chatAreaLeft?: number
  onToggleRightPanel?: () => void
  chatColumnVisible?: boolean
  onToggleChatColumn?: () => void
}

type DragClipStyle = {
  right?: string
  width?: number | string
  pointerEvents?: CSSProperties['pointerEvents']
  overflow?: CSSProperties['overflow']
  WebkitAppRegion?: string
}

function resolveDragRightClip(
  isStandalonePanel: boolean,
  isSettings: boolean,
  rightPanelOpen: boolean,
  chatColumnVisible: boolean,
  sidebarInline: boolean,
  rightPanelWidth: number,
): DragClipStyle {
  if (isStandalonePanel) {
    const right = electronPlatform() === 'darwin'
      ? DESKTOP_NEWS_TITLE_DRAG_CLIP_DARWIN
      : DESKTOP_NEWS_TITLE_DRAG_CLIP_WIN
    return { right: `${right}px` }
  }
  if (isSettings || !rightPanelOpen) return {}
  if (!chatColumnVisible) {
    if (sidebarInline) {
      return { right: `calc(100% - ${SIDEBAR_INLINE_WIDTH}px)` }
    }
    return {
      width: 0,
      overflow: 'hidden',
      pointerEvents: 'none',
      WebkitAppRegion: 'no-drag',
    }
  }
  if (rightPanelWidth > 0) return { right: `${rightPanelWidth}px` }
  return {}
}

export default function DesktopWindowChrome({
  title,
  titleSlot,
  viewMode = 'chat',
  sidebarOpen = false,
  sidebarInline = false,
  showSidebarToggle = true,
  sidebarHoverReveal = false,
  canGoBack = false,
  canGoForward = false,
  onToggleSidebar,
  onRevealSidebar,
  onNewChat,
  onGoBack,
  onGoForward,
  rightPanelOpen = false,
  rightPanelWidth = 0,
  chatColumnWidth,
  chatAreaLeft = 0,
  onToggleRightPanel,
  chatColumnVisible = true,
  onToggleChatColumn,
}: DesktopWindowChromeProps) {
  const s = useStyles()
  const macFullscreen = useElectronFullscreen()
  const titleMeasureRef = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280,
  )
  const [titleBlockWidth, setTitleBlockWidth] = useState(0)

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const isSettings = viewMode === 'settings'
  const isNews = viewMode === 'news'
  const isMarket = viewMode === 'market'
  const isStandalonePanel = isNews || isMarket
  const chromeTop = desktopChromeTopOffset()
  const chromeBand = desktopChromeBandHeight()
  const titleLeft = desktopTitleLeft(sidebarInline, viewMode, macFullscreen)
  const toolbarLeft = desktopToolbarLeft(macFullscreen)
  const titleBarActionsRight = desktopTitleBarActionsRight()
  const showTitleBarActions = !isSettings && !rightPanelOpen && Boolean(onToggleRightPanel || onToggleChatColumn)
  const titleMaxWidth = desktopTitleMaxWidth({
    titleLeft,
    viewportWidth,
    rightPanelOpen,
    rightPanelWidth,
    chatColumnVisible,
    reserveTitleBarActions: showTitleBarActions,
    titleBarActionsRight,
    titleBarActionsWidth: DESKTOP_TITLE_BAR_ACTIONS_WIDTH,
    chatColumnWidth,
    chatAreaLeft,
  })
  const showPageTitle = !isStandalonePanel && !isSettings && chatColumnVisible
  const interactiveTitle = showPageTitle && Boolean(titleSlot)

  const titleSlotWithLayout = titleSlot && isValidElement(titleSlot)
    ? cloneElement(titleSlot, { maxWidth: titleMaxWidth } as { maxWidth: number })
    : titleSlot

  useLayoutEffect(() => {
    if (!isElectron() || !interactiveTitle) {
      setTitleBlockWidth(0)
      return
    }
    const el = titleMeasureRef.current
    if (!el) return

    const update = () => {
      setTitleBlockWidth(Math.ceil(el.getBoundingClientRect().width))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [interactiveTitle, title, titleMaxWidth, titleSlotWithLayout])

  if (!isElectron()) return null

  /** 仅让出可点击标题的实际宽度，其余标题栏带仍可拖拽 */
  const dragResumeLeft = interactiveTitle
    ? titleLeft + (titleBlockWidth > 0 ? titleBlockWidth : 0)
    : titleLeft

  const dragRightClip = resolveDragRightClip(
    isStandalonePanel,
    isSettings,
    rightPanelOpen,
    chatColumnVisible,
    sidebarInline,
    rightPanelWidth,
  )

  const handleSidebarPointer = () => {
    if (sidebarHoverReveal) {
      if (!sidebarOpen) onRevealSidebar?.()
      return
    }
    onToggleSidebar?.()
  }

  const handleSidebarClick = () => {
    if (sidebarHoverReveal) {
      if (sidebarOpen) onToggleSidebar?.()
      else onRevealSidebar?.()
      return
    }
    onToggleSidebar?.()
  }

  return createPortal(
    <>
      <header className={s.chromeBar} aria-label="窗口标题栏">
        {interactiveTitle ? (
          <>
            <div
              className={s.drag}
              style={{ left: 0, width: `${titleLeft}px` }}
              aria-hidden
            />
            <div
              className={s.drag}
              style={{ left: `${dragResumeLeft}px`, right: 0, ...dragRightClip }}
              aria-hidden
            />
          </>
        ) : (
          <div className={s.drag} style={{ left: 0, right: 0, ...dragRightClip }} aria-hidden />
        )}

        {showPageTitle && (
          <div
            className={mergeClasses(s.title, titleSlot != null && titleSlot !== false && s.titleInteractive)}
            style={{
              top: `${chromeTop}px`,
              height: `${chromeBand}px`,
              left: `${titleLeft}px`,
              maxWidth: `${titleMaxWidth}px`,
            }}
          >
            {titleSlotWithLayout ? (
              <div ref={titleMeasureRef} className={s.titleSlotWrap}>
                {titleSlotWithLayout}
              </div>
            ) : (
              <Text className={s.titleText}>{title || '新对话'}</Text>
            )}
          </div>
        )}

        <div
          className={s.toolbar}
          style={{
            top: `${chromeTop}px`,
            height: `${chromeBand}px`,
            left: `${toolbarLeft}px`,
          }}
        >
          {showSidebarToggle && (onToggleSidebar || onRevealSidebar) && (
            <ChromeToolButton
              label={sidebarOpen ? '收起侧栏' : '展开侧栏'}
              iconPadding={DESKTOP_SIDEBAR_TOOL_ICON_PADDING}
              onMouseEnter={sidebarHoverReveal ? handleSidebarPointer : undefined}
              onClick={handleSidebarClick}
            >
              {sidebarOpen
                ? <PanelLeftContractRegular fontSize={DESKTOP_SIDEBAR_TOOL_ICON_SIZE} />
                : <PanelLeftExpandRegular fontSize={DESKTOP_SIDEBAR_TOOL_ICON_SIZE} />}
            </ChromeToolButton>
          )}
          {onGoBack && (
            <ChromeToolButton
              label={isSettings ? '返回应用' : '后退'}
              disabled={!canGoBack}
              onClick={onGoBack}
            >
              <ArrowLeftRegular fontSize={DESKTOP_TOOL_ICON_SIZE} />
            </ChromeToolButton>
          )}
          {!isSettings && onGoForward && (
            <ChromeToolButton label="前进" disabled={!canGoForward} onClick={onGoForward}>
              <ArrowRightRegular fontSize={DESKTOP_TOOL_ICON_SIZE} />
            </ChromeToolButton>
          )}
          {!isSettings && onNewChat && !sidebarOpen && (
            <ChromeToolButton label="新建对话" onClick={onNewChat}>
              <ChatAddRegular fontSize={DESKTOP_TOOL_ICON_SIZE} />
            </ChromeToolButton>
          )}
          <AppUpdateChromeHint
            sidebarOpen={sidebarOpen}
            sidebarHoverReveal={sidebarHoverReveal}
            onRevealSidebar={onRevealSidebar}
            onToggleSidebar={onToggleSidebar}
          />
        </div>
      </header>

      {!isSettings && !rightPanelOpen && (onToggleRightPanel || onToggleChatColumn) && (
        <div
          className={s.titleBarActions}
          style={{
            top: `${chromeTop}px`,
            height: `${chromeBand}px`,
            right: `${titleBarActionsRight}px`,
          }}
        >
          {onToggleChatColumn && (
            <ChromeToolButton
              label={chatColumnVisible ? '最大化右侧面板' : '恢复聊天区域'}
              iconPadding={DESKTOP_SIDEBAR_TOOL_ICON_PADDING}
              onClick={onToggleChatColumn}
            >
              {chatColumnVisible
                ? <ArrowMaximizeRegular fontSize={DESKTOP_SIDEBAR_TOOL_ICON_SIZE} />
                : <ArrowMinimizeRegular fontSize={DESKTOP_SIDEBAR_TOOL_ICON_SIZE} />}
            </ChromeToolButton>
          )}
          {onToggleRightPanel && (
            <ChromeToolButton
              label="展开右侧面板"
              iconPadding={DESKTOP_SIDEBAR_TOOL_ICON_PADDING}
              onClick={onToggleRightPanel}
            >
              <PanelRightExpandRegular fontSize={DESKTOP_SIDEBAR_TOOL_ICON_SIZE} />
            </ChromeToolButton>
          )}
        </div>
      )}

      <WindowControls />
    </>,
    document.body,
  )
}
