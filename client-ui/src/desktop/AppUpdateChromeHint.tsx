import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { useAppUpdate } from '../hooks/useAppUpdate'
import { isElectron } from '../platform/detect'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import {
  getAppUpdateChromeHintLabel,
  shouldShowAppUpdateChromeHint,
} from '../utils/appUpdateUi'

const useStyles = makeStyles({
  hint: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 500,
    lineHeight: 1,
    color: opptrixCssVars.accent,
    padding: '4px 8px',
    borderRadius: opptrixTokens.radiusSm,
    backgroundColor: opptrixCssVars.accentSoft,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    WebkitAppRegion: 'no-drag',
    border: 'none',
    flexShrink: 0,
    ':hover': {
      opacity: 0.88,
    },
  },
  hintError: {
    color: opptrixCssVars.error,
    backgroundColor: opptrixCssVars.errorSoft,
  },
})

interface AppUpdateChromeHintProps {
  sidebarOpen: boolean
  sidebarHoverReveal?: boolean
  onRevealSidebar?: () => void
  onToggleSidebar?: () => void
}

export default function AppUpdateChromeHint({
  sidebarOpen,
  sidebarHoverReveal = false,
  onRevealSidebar,
  onToggleSidebar,
}: AppUpdateChromeHintProps) {
  const s = useStyles()
  const { status } = useAppUpdate()

  if (!isElectron() || sidebarOpen || !shouldShowAppUpdateChromeHint(status)) {
    return null
  }

  const label = getAppUpdateChromeHintLabel(status)
  if (!label) return null

  const handleClick = () => {
    if (sidebarHoverReveal) onRevealSidebar?.()
    else onToggleSidebar?.()
  }

  const canClick = Boolean(onRevealSidebar || onToggleSidebar)

  return (
    <button
      type="button"
      className={mergeClasses(s.hint, status.state === 'error' && s.hintError, 'opptrix-focusable')}
      aria-label={label}
      title={status.message ?? label}
      onClick={canClick ? handleClick : undefined}
      disabled={!canClick}
    >
      {label}
    </button>
  )
}
