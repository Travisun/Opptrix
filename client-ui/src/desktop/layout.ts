import { electronPlatform } from '../platform/detect'
import { opptrixTokens } from '../theme/tokens'
import {
  DESKTOP_SETTINGS_SIDEBAR_WIDTH,
  DESKTOP_TITLE_BAR_ACTIONS_WIDTH,
  DESKTOP_TITLE_GAP,
  DESKTOP_TITLEBAR_HEIGHT,
  DESKTOP_TOOL_GAP,
  DESKTOP_TOOL_SIZE,
  DESKTOP_TOOLBAR_TOOL_COUNT,
  DESKTOP_TRAFFIC_LIGHT_WIDTH,
  DESKTOP_TRAFFIC_LIGHT_WIDTH_FULLSCREEN,
  DESKTOP_Z_TITLE_INTERACTIVE,
} from './constants'

export function desktopToolbarLeft(fullscreen = false): number {
  if (electronPlatform() !== 'darwin') return 12
  return fullscreen ? DESKTOP_TRAFFIC_LIGHT_WIDTH_FULLSCREEN : DESKTOP_TRAFFIC_LIGHT_WIDTH
}

export function desktopToolbarWidth(): number {
  return DESKTOP_TOOLBAR_TOOL_COUNT * DESKTOP_TOOL_SIZE
    + (DESKTOP_TOOLBAR_TOOL_COUNT - 1) * DESKTOP_TOOL_GAP
}

export type DesktopViewMode = 'chat' | 'settings' | 'news'

export function desktopTitleLeft(
  sidebarInline: boolean,
  view: DesktopViewMode = 'chat',
  fullscreen = false,
): number {
  const afterToolbar = desktopToolbarLeft(fullscreen) + desktopToolbarWidth() + DESKTOP_TITLE_GAP
  if (view === 'settings') {
    if (sidebarInline) {
      return DESKTOP_SETTINGS_SIDEBAR_WIDTH + DESKTOP_TITLE_GAP
    }
    return afterToolbar
  }
  if (sidebarInline) {
    return opptrixTokens.sidebarWidthPx + DESKTOP_TITLE_GAP
  }
  return afterToolbar
}

export function desktopTitleMaxWidth(opts: {
  titleLeft: number
  viewportWidth: number
  rightPanelOpen?: boolean
  rightPanelWidth?: number
  chatColumnVisible?: boolean
  reserveTitleBarActions?: boolean
  titleBarActionsRight?: number
  titleBarActionsWidth?: number
  /** Measured chat column width — refines ellipsis when split layout is active */
  chatColumnWidth?: number
  /** Left edge of chat column in viewport (inline sidebar width, else 0) */
  chatAreaLeft?: number
}): number {
  const trailingPad = DESKTOP_TITLE_GAP
  let rightEdge = opts.viewportWidth - trailingPad

  if (opts.rightPanelOpen && opts.chatColumnVisible !== false && (opts.rightPanelWidth ?? 0) > 0) {
    rightEdge = opts.viewportWidth - (opts.rightPanelWidth ?? 0) - trailingPad
  } else if (opts.reserveTitleBarActions) {
    const actionsRight = opts.titleBarActionsRight ?? 12
    const actionsWidth = opts.titleBarActionsWidth ?? DESKTOP_TITLE_BAR_ACTIONS_WIDTH
    rightEdge = opts.viewportWidth - actionsRight - actionsWidth - trailingPad
  }

  let available = rightEdge - opts.titleLeft

  if (opts.chatColumnWidth != null && opts.chatColumnWidth > 0) {
    const chatAreaLeft = opts.chatAreaLeft ?? 0
    const offsetInChat = Math.max(0, opts.titleLeft - chatAreaLeft)
    available = Math.min(available, opts.chatColumnWidth - offsetInChat - trailingPad)
  }

  return Math.max(96, Math.min(480, available))
}

/** 可点击标题区右缘 — 用于在全局 drag 层上留出“洞” */
export function desktopTitleZoneRight(titleLeft: number, titleMaxWidth: number): number {
  return titleLeft + titleMaxWidth
}

export function desktopChromeToolbarReserve(fullscreen = false): number {
  return desktopToolbarLeft(fullscreen) + desktopToolbarWidth() + DESKTOP_TITLE_GAP
}

export { DESKTOP_TITLEBAR_HEIGHT }
