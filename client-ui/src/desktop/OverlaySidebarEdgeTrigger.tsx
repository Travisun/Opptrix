import { createPortal } from 'react-dom'
import { makeStyles } from '@fluentui/react-components'
import { DESKTOP_Z_OVERLAY_SIDEBAR } from './constants'

const EDGE_WIDTH_PX = 8

const useStyles = makeStyles({
  edge: {
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    width: `${EDGE_WIDTH_PX}px`,
    zIndex: DESKTOP_Z_OVERLAY_SIDEBAR - 1,
    pointerEvents: 'auto',
    backgroundColor: 'transparent',
  },
})

interface OverlaySidebarEdgeTriggerProps {
  enabled: boolean
  onReveal: () => void
}

/** Left-edge hover zone to reveal overlay sidebar in compact window mode. */
export default function OverlaySidebarEdgeTrigger({
  enabled,
  onReveal,
}: OverlaySidebarEdgeTriggerProps) {
  const s = useStyles()

  if (!enabled) return null

  return createPortal(
    <div
      className={s.edge}
      onMouseEnter={onReveal}
      aria-hidden
    />,
    document.body,
  )
}

export { EDGE_WIDTH_PX as OVERLAY_SIDEBAR_EDGE_WIDTH_PX }
