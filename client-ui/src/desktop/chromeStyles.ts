import {
  DESKTOP_SIDEBAR_TOGGLE_WIDTH,
  DESKTOP_TITLEBAR_HEIGHT,
  DESKTOP_TRAFFIC_LIGHT_INSET,
} from './constants'
import { innoTokens } from '../theme/tokens'

/** Unified window background for Electron desktop */
export const electronAppBg = 'transparent'

export const electronHeaderOverlay = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  height: `${DESKTOP_TITLEBAR_HEIGHT}px`,
  minHeight: `${DESKTOP_TITLEBAR_HEIGHT}px`,
  padding: '0 16px',
  backgroundColor: 'transparent',
  borderBottom: 'none',
  boxShadow: 'none',
  zIndex: 1150,
  WebkitAppRegion: 'drag' as const,
  display: 'flex' as const,
  alignItems: 'center' as const,
  gap: '8px',
}

export const electronHeaderMac = {
  paddingLeft: `${DESKTOP_TRAFFIC_LIGHT_INSET}px`,
}

export const electronHeaderWin = {
  paddingRight: '132px',
}

export const electronNoDrag = {
  pointerEvents: 'auto' as const,
  WebkitAppRegion: 'no-drag' as const,
}

export const electronToolbarTitle = {
  fontSize: '13px',
  fontWeight: 600,
  color: innoTokens.textSecondary,
  letterSpacing: '-0.01em',
}

export const electronIconBtnCompact = {
  minWidth: `${DESKTOP_SIDEBAR_TOGGLE_WIDTH}px`,
  height: '28px',
  borderRadius: '8px',
}

export const electronSidebarSurface = {
  backgroundColor: innoTokens.sidebarGlass,
  backdropFilter: innoTokens.sidebarGlassBlur,
  WebkitBackdropFilter: innoTokens.sidebarGlassBlur,
}

export const electronChromeFooter = {
  backgroundColor: 'transparent',
  borderTop: 'none',
  boxShadow: 'none',
}

export const electronChromeInputDock = {
  backgroundColor: 'transparent',
  borderTop: 'none',
  boxShadow: 'none',
}
