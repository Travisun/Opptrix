import { createPortal } from 'react-dom'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { isElectron, electronPlatform } from '../platform/detect'
import {
  DESKTOP_FRAME_TITLEBAR_HEIGHT,
  DESKTOP_Z_CHROME_TOOLS,
} from './constants'
import FrameAppMenu from './FrameAppMenu'
import WindowControls from './WindowControls'
/** Canonical brand mark (`icons/logo@64.png`) — CSS 16px @4x, lossless PNG. */
import brandMarkUrl from '@opptrix-icons/logo@64.png?url'

/** Above OnboardingShell (2000) so min/max/close stay clickable during setup. */
const FRAME_TITLEBAR_Z = Math.max(DESKTOP_Z_CHROME_TOOLS + 20, 2100)

const useStyles = makeStyles({
  root: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    height: `${DESKTOP_FRAME_TITLEBAR_HEIGHT}px`,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    zIndex: FRAME_TITLEBAR_Z,
    WebkitAppRegion: 'drag',
    pointerEvents: 'auto',
  },
  brand: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingLeft: '10px',
    paddingRight: '4px',
    WebkitAppRegion: 'drag',
  },
  brandIcon: {
    width: '16px',
    height: '16px',
    display: 'block',
    objectFit: 'contain',
    pointerEvents: 'none',
    userSelect: 'none',
  },
  dragFill: {
    flex: '1 1 auto',
    minWidth: '8px',
    alignSelf: 'stretch',
  },
  controls: {
    flexShrink: 0,
    alignSelf: 'stretch',
    height: '100%',
    WebkitAppRegion: 'no-drag',
  },
})

/**
 * Non-mac Electron: top window-frame titlebar.
 * Left: app icon + simulated application menu; right: Win11-style caption buttons.
 * Background uses the same glass strategy as the left sidebar (`opptrix-glass-sidebar`).
 */
export default function WindowFrameTitleBar() {
  const s = useStyles()

  if (!isElectron()) return null
  if (electronPlatform() === 'darwin') return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className={mergeClasses(s.root, 'opptrix-window-frame-titlebar', 'opptrix-glass-sidebar')}
      aria-label="窗口标题栏"
    >
      <div className={s.brand} aria-hidden>
        <img className={s.brandIcon} src={brandMarkUrl} alt="" width={16} height={16} draggable={false} />
      </div>
      <FrameAppMenu />
      <div className={s.dragFill} aria-hidden />
      <div className={s.controls}>
        <WindowControls />
      </div>
    </div>,
    document.body,
  )
}
