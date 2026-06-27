import { electronPlatform } from '../platform/detect'
import { innoTokens } from '../theme/tokens'
import {
  DESKTOP_SETTINGS_SIDEBAR_WIDTH,
  DESKTOP_TITLE_GAP,
  DESKTOP_TITLEBAR_HEIGHT,
  DESKTOP_TOOL_GAP,
  DESKTOP_TOOL_SIZE,
  DESKTOP_TOOLBAR_TOOL_COUNT,
  DESKTOP_TRAFFIC_LIGHT_WIDTH,
} from './constants'

export function desktopToolbarLeft(): number {
  return electronPlatform() === 'darwin' ? DESKTOP_TRAFFIC_LIGHT_WIDTH : 12
}

export function desktopToolbarWidth(): number {
  return DESKTOP_TOOLBAR_TOOL_COUNT * DESKTOP_TOOL_SIZE
    + (DESKTOP_TOOLBAR_TOOL_COUNT - 1) * DESKTOP_TOOL_GAP
}

export type DesktopViewMode = 'chat' | 'settings'

export function desktopTitleLeft(sidebarInline: boolean, view: DesktopViewMode = 'chat'): number {
  const afterToolbar = desktopToolbarLeft() + desktopToolbarWidth() + DESKTOP_TITLE_GAP
  if (view === 'settings') {
    if (sidebarInline) {
      return DESKTOP_SETTINGS_SIDEBAR_WIDTH + DESKTOP_TITLE_GAP
    }
    return afterToolbar
  }
  if (sidebarInline) {
    return innoTokens.sidebarWidthPx + DESKTOP_TITLE_GAP
  }
  return afterToolbar
}

export { DESKTOP_TITLEBAR_HEIGHT }
