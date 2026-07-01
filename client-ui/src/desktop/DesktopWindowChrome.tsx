import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import {
  ArrowLeftRegular,
  ArrowRightRegular,
} from '@fluentui/react-icons'
import { makeStyles, Text } from '@fluentui/react-components'
import { isElectron } from '../platform/detect'
import {
  DESKTOP_CHROME_BAND_HEIGHT,
  DESKTOP_CHROME_TOP_OFFSET,
  DESKTOP_SIDEBAR_LAYOUT_EASE,
  DESKTOP_SIDEBAR_LAYOUT_MS,
  DESKTOP_SIDEBAR_TOOL_ICON_PADDING,
  DESKTOP_SIDEBAR_TOOL_ICON_SIZE,
  DESKTOP_TITLEBAR_HEIGHT,
  DESKTOP_TOOL_GAP,
  DESKTOP_TOOL_ICON_SIZE,
  DESKTOP_Z_CHROME_TOOLS,
  DESKTOP_Z_TITLE,
  DESKTOP_NEWS_TITLE_DRAG_CLIP_DARWIN,
  DESKTOP_NEWS_TITLE_DRAG_CLIP_WIN,
  SIDEBAR_INLINE_WIDTH,
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
import { opptrixTokens } from '../theme/tokens'
import { desktopTitleLeft, desktopToolbarLeft, type DesktopViewMode } from './layout'
import ChromeToolButton from './ChromeToolButton'
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
    inset: 0,
    WebkitAppRegion: 'drag',
    pointerEvents: 'auto',
  },
  toolbar: {
    position: 'absolute',
    top: `${DESKTOP_CHROME_TOP_OFFSET}px`,
    height: `${DESKTOP_CHROME_BAND_HEIGHT}px`,
    display: 'flex',
    alignItems: 'center',
    gap: `${DESKTOP_TOOL_GAP}px`,
    pointerEvents: 'auto',
    WebkitAppRegion: 'no-drag',
    zIndex: 1,
    transitionProperty: 'left',
    transitionDuration: `${DESKTOP_SIDEBAR_LAYOUT_MS}ms`,
    transitionTimingFunction: DESKTOP_SIDEBAR_LAYOUT_EASE,
  },
  title: {
    position: 'fixed',
    top: `${DESKTOP_CHROME_TOP_OFFSET}px`,
    height: `${DESKTOP_CHROME_BAND_HEIGHT}px`,
    display: 'flex',
    alignItems: 'center',
    maxWidth: 'min(480px, 46vw)',
    pointerEvents: 'none',
    WebkitAppRegion: 'drag',
    zIndex: DESKTOP_Z_TITLE,
    transitionProperty: 'left',
    transitionDuration: `${DESKTOP_SIDEBAR_LAYOUT_MS}ms`,
    transitionTimingFunction: DESKTOP_SIDEBAR_LAYOUT_EASE,
  },
  titleText: {
    fontSize: '13px',
    fontWeight: 500,
    color: opptrixTokens.textPrimary,
    letterSpacing: '-0.01em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: '100%',
  },
  titleBarActions: {
    position: 'fixed',
    top: `${DESKTOP_CHROME_TOP_OFFSET}px`,
    height: `${DESKTOP_CHROME_BAND_HEIGHT}px`,
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
  viewMode?: DesktopViewMode
  sidebarOpen?: boolean
  sidebarInline?: boolean
  showSidebarToggle?: boolean
  /** Overlay mode: hover toolbar button to reveal sidebar */
  sidebarHoverReveal?: boolean
  canGoBack?: boolean
  canGoForward?: boolean
  onToggleSidebar?: () => void
  onRevealSidebar?: () => void
  onNewChat?: () => void
  onGoBack?: () => void
  onGoForward?: () => void
  rightPanelOpen?: boolean
  /** Width of the open right panel — used to clip global drag off panel title bar. */
  rightPanelWidth?: number
  onToggleRightPanel?: () => void
  chatColumnVisible?: boolean
  onToggleChatColumn?: () => void
}

export default function DesktopWindowChrome({
  title,
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
  onToggleRightPanel,
  chatColumnVisible = true,
  onToggleChatColumn,
}: DesktopWindowChromeProps) {
  const s = useStyles()
  const macFullscreen = useElectronFullscreen()

  if (!isElectron()) return null

  const isSettings = viewMode === 'settings'
  const isNews = viewMode === 'news'
  const titleLeft = desktopTitleLeft(sidebarInline, viewMode, macFullscreen)
  const toolbarLeft = desktopToolbarLeft(macFullscreen)
  const titleBarActionsRight = electronPlatform() === 'darwin' ? 12 : 132

  /** Clip global drag off interactive title bands (news actions, right panel, etc.). */
  const dragLayerStyle: CSSProperties = (() => {
    if (isNews) {
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
  })()

  /** Page title in the chrome band (news uses its own in-page title bar). */
  const showPageTitle = !isNews && !isSettings && chatColumnVisible

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
      {showPageTitle && (
        <div className={s.title} style={{ left: `${titleLeft}px` }}>
          <Text className={s.titleText}>{title || (isNews ? '新闻中心' : '新对话')}</Text>
        </div>
      )}

      <header className={s.chromeBar} aria-label="窗口标题栏">
        <div className={s.drag} style={dragLayerStyle} aria-hidden />

        <div className={s.toolbar} style={{ left: `${toolbarLeft}px` }}>
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
          {!isSettings && onGoBack && (
            <ChromeToolButton label="后退" disabled={!canGoBack} onClick={onGoBack}>
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
        </div>
      </header>

      {!isSettings && !rightPanelOpen && (onToggleRightPanel || onToggleChatColumn) && (
        <div
          className={s.titleBarActions}
          style={{ right: `${titleBarActionsRight}px` }}
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
