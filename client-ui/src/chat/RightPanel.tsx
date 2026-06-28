import { makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  DESKTOP_SIDEBAR_LAYOUT_EASE,
  DESKTOP_SIDEBAR_LAYOUT_MS,
  DESKTOP_TITLEBAR_HEIGHT,
  WORKSPACE_RIGHT_PANEL_DEFAULT_WIDTH,
} from '../desktop/constants'
import RightMarketPanel from '../market/RightMarketPanel'

const useStyles = makeStyles({
  panelShell: {
    flexShrink: 0,
    width: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
    transitionProperty: 'width',
    transitionDuration: `${DESKTOP_SIDEBAR_LAYOUT_MS}ms`,
    transitionTimingFunction: DESKTOP_SIDEBAR_LAYOUT_EASE,
  },
  panelShellOpen: {
    pointerEvents: 'auto',
  },
  panelShellNoTransition: {
    transitionProperty: 'none',
  },
  panelShellElectron: {
    marginTop: `-${DESKTOP_TITLEBAR_HEIGHT}px`,
    boxSizing: 'border-box',
  },
  panel: {
    height: '100%',
    minHeight: 0,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
  },
})

interface Props {
  visible: boolean
  width?: number
  fullWidth?: boolean
  transitionEnabled?: boolean
  electronChrome?: boolean
  chatColumnVisible?: boolean
  onToggleRightPanel?: () => void
  onToggleChatColumn?: () => void
}

export default function RightPanel({
  visible,
  width = WORKSPACE_RIGHT_PANEL_DEFAULT_WIDTH,
  fullWidth = false,
  transitionEnabled = true,
  electronChrome = false,
  chatColumnVisible = true,
  onToggleRightPanel,
  onToggleChatColumn,
}: Props) {
  const s = useStyles()

  const contentWidth = fullWidth ? undefined : width
  const shellWidth = !visible
    ? 0
    : fullWidth
      ? '100%'
      : width

  return (
    <div
      className={mergeClasses(
        s.panelShell,
        visible && s.panelShellOpen,
        !transitionEnabled && s.panelShellNoTransition,
        electronChrome && s.panelShellElectron,
      )}
      style={{ width: typeof shellWidth === 'number' ? `${shellWidth}px` : shellWidth }}
    >
      <aside
        className={mergeClasses(s.panel, 'inno-right-panel')}
        style={contentWidth != null ? { width: `${contentWidth}px`, minWidth: `${contentWidth}px` } : { width: '100%' }}
        aria-label="行情侧栏"
        aria-hidden={!visible}
      >
        <RightMarketPanel
          electronChrome={electronChrome}
          chatColumnVisible={chatColumnVisible}
          onToggleRightPanel={visible ? onToggleRightPanel : undefined}
          onToggleChatColumn={visible ? onToggleChatColumn : undefined}
        />
      </aside>
    </div>
  )
}
