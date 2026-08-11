import { createPortal } from 'react-dom'
import { cloneElement, isValidElement, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  ArrowLeftRegular,
  ArrowRightRegular,
  SearchRegular,
} from '@fluentui/react-icons'
import { makeStyles, mergeClasses, Text } from '@fluentui/react-components'
import { isElectron } from '../platform/detect'
import {
  DESKTOP_SIDEBAR_LAYOUT_EASE,
  DESKTOP_SIDEBAR_LAYOUT_MS,
  DESKTOP_SIDEBAR_TOOL_ICON_PADDING,
  DESKTOP_SIDEBAR_TOOL_ICON_SIZE,
  DESKTOP_TITLE_GAP,
  DESKTOP_TITLEBAR_HEIGHT,
  DESKTOP_TOOL_GAP,
  DESKTOP_TOOL_ICON_SIZE,
  DESKTOP_Z_CHROME_TOOLS,
  DESKTOP_NEWS_TITLE_DRAG_CLIP_DARWIN,
  DESKTOP_NEWS_TITLE_DRAG_CLIP_WIN,
  SIDEBAR_DEFAULT_WIDTH,
  DESKTOP_TITLE_BAR_ACTIONS_WIDTH,
  DESKTOP_TRAFFIC_LIGHT_WIDTH,
  WORKSPACE_SPLITTER_WIDTH,
  RIGHT_PANEL_PEER_SLIDE_MS,
  RIGHT_PANEL_PEER_SLIDE_EASE,
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
  desktopFrameTitlebarHeight,
  desktopTitleBarActionsRight,
  desktopTitleLeft,
  desktopTitleMaxWidth,
  desktopToolbarLeft,
  type DesktopViewMode,
} from './layout'
import ChromeToolButton from './ChromeToolButton'
import AppUpdateChromeHint from './AppUpdateChromeHint'
import MacTrafficLights from './MacTrafficLights'
import { useElectronFullscreen } from '../hooks/useElectronFullscreen'

const useStyles = makeStyles({
  chromeBar: {
    position: 'fixed',
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
    boxSizing: 'border-box',
    transitionProperty: 'left, width, padding',
    transitionDuration: `${DESKTOP_SIDEBAR_LAYOUT_MS}ms`,
    transitionTimingFunction: DESKTOP_SIDEBAR_LAYOUT_EASE,
  },
  /** Open sidebar: collapse left, back/forward right (space-between across sidebar width) */
  toolbarSplitInSidebar: {
    justifyContent: 'space-between',
    gap: 0,
  },
  toolbarCluster: {
    display: 'flex',
    alignItems: 'center',
    gap: `${DESKTOP_TOOL_GAP}px`,
    flexShrink: 0,
  },
  toolbarSpacer: {
    flex: '1 1 auto',
    minWidth: '12px',
    alignSelf: 'stretch',
    WebkitAppRegion: 'drag',
    pointerEvents: 'auto',
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
    fontSize: 'var(--opptrix-font-base)',
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
  /** 标题栏右侧额外操作（如技能专长），始终显示在窗口控件左侧 */
  titleBarTrailing?: ReactNode
  viewMode?: DesktopViewMode
  sidebarOpen?: boolean
  sidebarInline?: boolean
  sidebarWidth?: number
  sidebarDragging?: boolean
  showSidebarToggle?: boolean
  sidebarHoverReveal?: boolean
  canGoBack?: boolean
  canGoForward?: boolean
  onToggleSidebar?: () => void
  onRevealSidebar?: () => void
  onNewChat?: () => void
  onOpenSearch?: () => void
  onGoBack?: () => void
  onGoForward?: () => void
  rightPanelOpen?: boolean
  rightPanelWidth?: number
  /** 拖拽右栏分隔条时为 true — 顶栏 actions / 标题带 right 跟移禁用 transition */
  rightPanelDragging?: boolean
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
  sidebarWidth: number,
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
      return { right: `calc(100% - ${sidebarWidth}px)` }
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
  titleBarTrailing,
  viewMode = 'chat',
  sidebarOpen = false,
  sidebarInline = false,
  sidebarWidth = SIDEBAR_DEFAULT_WIDTH,
  sidebarDragging = false,
  showSidebarToggle = true,
  sidebarHoverReveal = false,
  canGoBack = false,
  canGoForward = false,
  onToggleSidebar,
  onRevealSidebar,
  onNewChat,
  onOpenSearch,
  onGoBack,
  onGoForward,
  rightPanelOpen = false,
  rightPanelWidth = 0,
  rightPanelDragging = false,
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
  const isExperts = viewMode === 'experts'
  const isStandalonePanel = isNews || isMarket || isExperts
  const frameTitlebarHeight = desktopFrameTitlebarHeight()
  const chromeTop = desktopChromeTopOffset()
  const chromeBand = desktopChromeBandHeight()
  const titleLeft = desktopTitleLeft(sidebarInline, viewMode, macFullscreen, sidebarWidth)
  const toolbarLeft = desktopToolbarLeft(macFullscreen)
  /** mac custom lights: leave a no-drag hole — `-webkit-app-region: drag` steals clicks even under higher z-index. */
  const showMacTrafficLights = electronPlatform() === 'darwin' && !macFullscreen
  const dragLeftInset = showMacTrafficLights ? DESKTOP_TRAFFIC_LIGHT_WIDTH : 0
  /**
   * Open inline sidebar: collapse left |····| back/forward at the sidebar divider.
   * Windows spans full sidebar from x=0; macOS starts after traffic lights.
   */
  const toolbarSplitInSidebar = sidebarInline && sidebarOpen
  const splitToolbarLeft = toolbarSplitInSidebar
    ? (showMacTrafficLights ? toolbarLeft : 0)
    : toolbarLeft
  const splitToolbarWidth = toolbarSplitInSidebar
    ? Math.max(0, sidebarWidth - splitToolbarLeft)
    : undefined
  const splitToolbarPadLeft = toolbarSplitInSidebar
    ? (showMacTrafficLights ? DESKTOP_TOOL_GAP : DESKTOP_TITLE_GAP)
    : undefined

  const titleBarActionsRight = rightPanelOpen && titleBarTrailing && rightPanelWidth > 0
    ? rightPanelWidth + WORKSPACE_SPLITTER_WIDTH + DESKTOP_TITLE_GAP
    : desktopTitleBarActionsRight()
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
  // Non-mac settings: frame titlebar is enough — skip the empty secondary chrome band.
  if (isSettings && frameTitlebarHeight > 0) return null

  /** 仅让出可点击标题的实际宽度，其余标题栏带仍可拖拽 */
  const dragResumeLeft = interactiveTitle
    ? titleLeft + (titleBlockWidth > 0 ? titleBlockWidth : 0)
    : titleLeft

  const chromeTransition = sidebarDragging
    ? 'none'
    : `${DESKTOP_SIDEBAR_LAYOUT_MS}ms`

  /** Right-panel width drives title max-width, drag clip, and preview icon — sync with peer morph curve. */
  const rightPanelChromeTransition = sidebarDragging || rightPanelDragging
    ? 'none'
    : rightPanelOpen
      ? `${RIGHT_PANEL_PEER_SLIDE_MS}ms`
      : `${DESKTOP_SIDEBAR_LAYOUT_MS}ms`
  const rightPanelChromeEase = rightPanelOpen && !sidebarDragging && !rightPanelDragging
    ? RIGHT_PANEL_PEER_SLIDE_EASE
    : DESKTOP_SIDEBAR_LAYOUT_EASE

  const dragRightClip = resolveDragRightClip(
    isStandalonePanel,
    isSettings,
    rightPanelOpen,
    chatColumnVisible,
    sidebarInline,
    sidebarWidth,
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
      <header
        className={s.chromeBar}
        style={{ top: `${frameTitlebarHeight}px` }}
        aria-label="窗口标题栏"
      >
        {interactiveTitle ? (
          <>
            {titleLeft > dragLeftInset ? (
              <div
                className={s.drag}
                style={{ left: `${dragLeftInset}px`, width: `${titleLeft - dragLeftInset}px` }}
                aria-hidden
              />
            ) : null}
            <div
              className={s.drag}
              style={{
                left: `${dragResumeLeft}px`,
                right: 0,
                ...dragRightClip,
                ...(dragRightClip.right != null
                  ? {
                      transitionProperty: 'right',
                      transitionDuration: rightPanelChromeTransition,
                      transitionTimingFunction: rightPanelChromeEase,
                    }
                  : {}),
              }}
              aria-hidden
            />
          </>
        ) : (
          <div
            className={s.drag}
            style={{
              left: `${dragLeftInset}px`,
              right: 0,
              ...dragRightClip,
              ...(dragRightClip.right != null
                ? {
                    transitionProperty: 'right',
                    transitionDuration: rightPanelChromeTransition,
                    transitionTimingFunction: rightPanelChromeEase,
                  }
                : {}),
            }}
            aria-hidden
          />
        )}

        {showPageTitle && (
          <div
            className={mergeClasses(s.title, titleSlot != null && titleSlot !== false && s.titleInteractive)}
          style={{
            top: `${chromeTop}px`,
            height: `${chromeBand}px`,
            left: `${titleLeft}px`,
            maxWidth: `${titleMaxWidth}px`,
            transitionDuration: rightPanelOpen ? rightPanelChromeTransition : chromeTransition,
            transitionTimingFunction: rightPanelOpen ? rightPanelChromeEase : DESKTOP_SIDEBAR_LAYOUT_EASE,
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
          className={mergeClasses(s.toolbar, toolbarSplitInSidebar && s.toolbarSplitInSidebar)}
          style={{
            top: `${chromeTop}px`,
            height: `${chromeBand}px`,
            left: `${splitToolbarLeft}px`,
            width: splitToolbarWidth != null ? `${splitToolbarWidth}px` : undefined,
            paddingLeft: splitToolbarPadLeft != null ? `${splitToolbarPadLeft}px` : undefined,
            paddingRight: toolbarSplitInSidebar ? `${DESKTOP_TITLE_GAP}px` : undefined,
            transitionDuration: chromeTransition,
          }}
        >
          {toolbarSplitInSidebar ? (
            <>
              <div className={s.toolbarCluster}>
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
                <AppUpdateChromeHint
                  sidebarOpen={sidebarOpen}
                  sidebarHoverReveal={sidebarHoverReveal}
                  onRevealSidebar={onRevealSidebar}
                  onToggleSidebar={onToggleSidebar}
                />
              </div>
              <div className={s.toolbarSpacer} aria-hidden />
              <div className={s.toolbarCluster}>
                {!isSettings && onOpenSearch && (
                  <ChromeToolButton label="搜索" onClick={onOpenSearch}>
                    <SearchRegular fontSize={DESKTOP_TOOL_ICON_SIZE} />
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
              </div>
            </>
          ) : (
            <>
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
              {!isSettings && onOpenSearch && (
                <ChromeToolButton label="搜索" onClick={onOpenSearch}>
                  <SearchRegular fontSize={DESKTOP_TOOL_ICON_SIZE} />
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
            </>
          )}
        </div>

        {/* After drag layers so paint order + no-drag hole both receive clicks */}
        {showMacTrafficLights ? <MacTrafficLights /> : null}
      </header>

      {!isSettings && (titleBarTrailing || (!rightPanelOpen && (onToggleRightPanel || onToggleChatColumn))) && (
        <div
          className={s.titleBarActions}
          style={{
            top: `${frameTitlebarHeight + chromeTop}px`,
            height: `${chromeBand}px`,
            right: `${titleBarActionsRight}px`,
            transitionProperty: 'right',
            transitionDuration: rightPanelChromeTransition,
            transitionTimingFunction: rightPanelChromeEase,
          }}
        >
          {titleBarTrailing}
          {!rightPanelOpen && onToggleChatColumn && (
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
          {!rightPanelOpen && onToggleRightPanel && (
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
    </>,
    document.body,
  )
}
