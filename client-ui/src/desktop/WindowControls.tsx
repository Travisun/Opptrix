import { makeStyles } from '@fluentui/react-components'
import { DismissRegular, SquareRegular, SubtractRegular } from '@fluentui/react-icons'
import { isElectron } from '../platform/detect'
import { DESKTOP_CHROME_BAND_HEIGHT, DESKTOP_CHROME_TOP_OFFSET, DESKTOP_Z_CHROME_TOOLS } from './constants'
import ChromeToolButton from './ChromeToolButton'

const useStyles = makeStyles({
  controls: {
    position: 'fixed',
    top: `${DESKTOP_CHROME_TOP_OFFSET}px`,
    right: 0,
    height: `${DESKTOP_CHROME_BAND_HEIGHT}px`,
    display: 'flex',
    alignItems: 'center',
    paddingRight: '6px',
    gap: '2px',
    zIndex: DESKTOP_Z_CHROME_TOOLS,
    WebkitAppRegion: 'no-drag',
  },
  closeBtn: {
    ':hover': {
      backgroundColor: 'rgba(255, 59, 48, 0.14)',
      color: '#FF3B30',
    },
  },
})

export default function WindowControls() {
  const s = useStyles()
  const api = window.electronAPI

  if (!isElectron() || !api || api.platform === 'darwin') return null

  return (
    <div className={s.controls}>
      <ChromeToolButton label="Minimize" onClick={() => api.windowMinimize?.()}>
        <SubtractRegular fontSize={14} />
      </ChromeToolButton>
      <ChromeToolButton label="Maximize" onClick={() => api.windowMaximize?.()}>
        <SquareRegular fontSize={13} />
      </ChromeToolButton>
      <ChromeToolButton
        className={s.closeBtn}
        label="Close"
        onClick={() => api.windowClose?.()}
      >
        <DismissRegular fontSize={14} />
      </ChromeToolButton>
    </div>
  )
}
