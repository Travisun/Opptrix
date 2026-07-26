import type { ReactNode } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { opptrixCssVars } from '../theme/tokens'
import {
  DESKTOP_SIDEBAR_LAYOUT_EASE,
  DESKTOP_SIDEBAR_LAYOUT_MS,
  DESKTOP_TITLE_GAP,
  DESKTOP_TITLEBAR_HEIGHT,
  DESKTOP_Z_PANEL_TITLE,
} from './constants'
import {
  desktopChromeTopOffset,
  desktopTitleBarActionsRight,
} from './layout'

const useStyles = makeStyles({
  root: {
    flexShrink: 0,
    height: `${DESKTOP_TITLEBAR_HEIGHT}px`,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderBottom: `1px solid ${opptrixCssVars.separatorStrong}`,
    backgroundColor: opptrixCssVars.canvas,
    position: 'relative',
    zIndex: DESKTOP_Z_PANEL_TITLE,
    transitionProperty: 'padding-left, padding-right',
    transitionDuration: `${DESKTOP_SIDEBAR_LAYOUT_MS}ms`,
    transitionTimingFunction: DESKTOP_SIDEBAR_LAYOUT_EASE,
  },
  title: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 500,
    letterSpacing: '-0.01em',
    color: opptrixCssVars.textPrimary,
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  spacer: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
  },
  meta: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
})

export type StandaloneElectronTitleBarProps = {
  title: string
  /**
   * Left safe inset when the session sidebar is fully collapsed.
   * Pass `desktopChromeToolbarReserve(fullscreen)` (or ChatApp’s `chromeToolbarReserve`);
   * `0` keeps the compact inline inset (`DESKTOP_TITLE_GAP`).
   */
  chromeToolbarReserve?: number
  meta?: ReactNode
  actions?: ReactNode
  className?: string
  /** Drag-fill class for page-specific drag clips (e.g. `opptrix-news-title-drag`) */
  dragRegionClassName?: string
}

/**
 * Electron standalone-page title band — left inset aligns with chat
 * `desktopTitleLeft(false)` / `desktopChromeToolbarReserve` when the sidebar is collapsed;
 * right inset uses `desktopTitleBarActionsRight()` (macOS 12 / Win window-controls reserve).
 * Vertical: same `desktopChromeTopOffset` nudge as `DesktopWindowChrome` title/toolbar.
 */
export default function StandaloneElectronTitleBar({
  title,
  chromeToolbarReserve = 0,
  meta,
  actions,
  className,
  dragRegionClassName,
}: StandaloneElectronTitleBarProps) {
  const s = useStyles()
  const paddingLeft = chromeToolbarReserve > 0 ? chromeToolbarReserve : DESKTOP_TITLE_GAP
  const paddingRight = desktopTitleBarActionsRight()
  // Match chat chrome title/toolbar: content centers in the band below chromeTop.
  const chromeTop = desktopChromeTopOffset()

  return (
    <div
      className={mergeClasses(s.root, className)}
      style={{
        paddingTop: `${chromeTop}px`,
        paddingLeft: `${paddingLeft}px`,
        paddingRight: `${paddingRight}px`,
      }}
    >
      <Text className={mergeClasses(s.title, 'opptrix-panel-title-no-drag')} block>
        {title}
      </Text>
      <div
        className={mergeClasses(s.spacer, dragRegionClassName)}
        aria-hidden
      />
      {meta != null && meta !== false ? (
        <Text className={mergeClasses(s.meta, 'opptrix-panel-title-no-drag')}>{meta}</Text>
      ) : null}
      {actions != null ? (
        <div className={mergeClasses(s.actions, 'opptrix-panel-title-no-drag')}>
          {actions}
        </div>
      ) : null}
    </div>
  )
}
