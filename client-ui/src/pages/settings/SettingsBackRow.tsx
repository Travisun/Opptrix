import { ArrowLeftRegular } from '@fluentui/react-icons'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { SIDEBAR_TOP_MENU_ICON_SIZE, sidebarTopMenuIcon, sidebarTopMenuRow, ghostInteractive } from '../../theme/mixins'
import {
  MOBILE_HEADER_ICON_SIZE,
  mobileHeaderBar,
} from '../../theme/mobileChrome'
import { opptrixCssVars } from '../../theme/tokens'

const useStyles = makeStyles({
  row: sidebarTopMenuRow,
  icon: sidebarTopMenuIcon,
  rowMobile: {
    ...mobileHeaderBar,
    ...ghostInteractive,
    width: '100%',
    margin: 0,
    justifyContent: 'flex-start',
    gap: '10px',
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-2xl)',
    fontWeight: 600,
    textAlign: 'left',
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
    borderRadius: 0,
    backgroundColor: opptrixCssVars.canvas,
  },
  iconMobile: {
    color: opptrixCssVars.textPrimary,
    flexShrink: 0,
  },
})

interface Props {
  onClick: () => void
  className?: string
  /** Web 移动端：与聊天 MobileTopBar 同高 / 同 icon */
  mobile?: boolean
}

export default function SettingsBackRow({ onClick, className, mobile = false }: Props) {
  const s = useStyles()
  return (
    <button
      type="button"
      className={mergeClasses(mobile ? s.rowMobile : s.row, 'opptrix-focusable', className)}
      onClick={onClick}
    >
      <ArrowLeftRegular
        className={mobile ? s.iconMobile : s.icon}
        fontSize={mobile ? MOBILE_HEADER_ICON_SIZE : SIDEBAR_TOP_MENU_ICON_SIZE}
      />
      <span>返回应用</span>
    </button>
  )
}
