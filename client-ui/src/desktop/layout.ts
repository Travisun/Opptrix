import { electronPlatform } from '../platform/detect'
import { opptrixTokens } from '../theme/tokens'
import {
  DESKTOP_SETTINGS_SIDEBAR_WIDTH,
  DESKTOP_TITLE_GAP,
  DESKTOP_TITLEBAR_HEIGHT,
  DESKTOP_TOOL_GAP,
  DESKTOP_TOOL_SIZE,
  DESKTOP_TOOLBAR_TOOL_COUNT,
  DESKTOP_TRAFFIC_LIGHT_WIDTH,
  DESKTOP_TRAFFIC_LIGHT_WIDTH_FULLSCREEN,
} from './constants'

export function desktopToolbarLeft(fullscreen = false): number {
  if (electronPlatform() !== 'darwin') return 12
  return fullscreen ? DESKTOP_TRAFFIC_LIGHT_WIDTH_FULLSCREEN : DESKTOP_TRAFFIC_LIGHT_WIDTH
}

export function desktopToolbarWidth(): number {
  return DESKTOP_TOOLBAR_TOOL_COUNT * DESKTOP_TOOL_SIZE
    + (DESKTOP_TOOLBAR_TOOL_COUNT - 1) * DESKTOP_TOOL_GAP
}

export type DesktopViewMode = 'chat' | 'settings'

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

export function desktopChromeToolbarReserve(fullscreen = false): number {
  return desktopToolbarLeft(fullscreen) + desktopToolbarWidth() + DESKTOP_TITLE_GAP
}

export { DESKTOP_TITLEBAR_HEIGHT }
