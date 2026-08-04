import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { DESKTOP_Z_OVERLAY_SIDEBAR } from './constants'
import { desktopFrameTitlebarHeight } from './layout'
import { OVERLAY_SIDEBAR_MS, useOverlaySidebarAnimation } from '../hooks/useOverlaySidebarAnimation'

const useStyles = makeStyles({
  panel: {
    position: 'fixed',
    left: 0,
    bottom: 0,
    zIndex: DESKTOP_Z_OVERLAY_SIDEBAR,
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    opacity: 0,
    transform: 'translateX(-100%)',
    transitionProperty: 'transform, opacity',
    transitionDuration: `${OVERLAY_SIDEBAR_MS}ms`,
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    backgroundColor: opptrixCssVars.canvas,
    border: `1px solid ${opptrixCssVars.border}`,
    borderLeft: 'none',
    borderRadius: `0 ${opptrixTokens.radiusLg} ${opptrixTokens.radiusLg} 0`,
    boxShadow: '2px 0 16px rgba(0, 0, 0, 0.06)',
    overflow: 'hidden',
  },
  panelVisible: {
    opacity: 1,
    transform: 'translateX(0)',
  },
})

interface OverlaySidebarShellProps {
  open: boolean
  width: string
  onClose?: () => void
  className?: string
  children: ReactNode
}

export default function OverlaySidebarShell({
  open,
  width,
  onClose,
  className,
  children,
}: OverlaySidebarShellProps) {
  const s = useStyles()
  const { mounted, presented } = useOverlaySidebarAnimation(open)

  if (!mounted) return null

  const panelStyle = {
    width,
    top: `${desktopFrameTitlebarHeight()}px`,
  } as CSSProperties

  return createPortal(
    <aside
      className={mergeClasses(
        s.panel,
        'opptrix-overlay-sidebar',
        presented && s.panelVisible,
        className,
      )}
      style={panelStyle}
      onMouseLeave={onClose}
    >
      {children}
    </aside>,
    document.body,
  )
}
