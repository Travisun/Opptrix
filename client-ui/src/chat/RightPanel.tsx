import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { innoTokens } from '../theme/tokens'
import {
  DESKTOP_SIDEBAR_LAYOUT_EASE,
  DESKTOP_SIDEBAR_LAYOUT_MS,
  WORKSPACE_RIGHT_PANEL_DEFAULT_WIDTH,
} from '../desktop/constants'

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
  panel: {
    height: '100%',
    minHeight: 0,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: innoTokens.canvas,
  },
  placeholder: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    textAlign: 'center',
    gap: '8px',
  },
  placeholderTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: innoTokens.textSecondary,
  },
  placeholderSub: {
    fontSize: '12px',
    color: innoTokens.textTertiary,
    lineHeight: 1.5,
  },
})

interface Props {
  visible: boolean
  width?: number
  fullWidth?: boolean
  transitionEnabled?: boolean
}

export default function RightPanel({
  visible,
  width = WORKSPACE_RIGHT_PANEL_DEFAULT_WIDTH,
  fullWidth = false,
  transitionEnabled = true,
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
      )}
      style={{ width: typeof shellWidth === 'number' ? `${shellWidth}px` : shellWidth }}
    >
      <aside
        className={mergeClasses(s.panel, 'inno-right-panel')}
        style={contentWidth != null ? { width: `${contentWidth}px`, minWidth: `${contentWidth}px` } : { width: '100%' }}
        aria-label="右侧面板"
        aria-hidden={!visible}
      >
        <div className={s.placeholder}>
          <Text className={s.placeholderTitle}>右侧面板</Text>
          <Text className={s.placeholderSub}>内容即将上线</Text>
        </div>
      </aside>
    </div>
  )
}
