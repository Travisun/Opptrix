import { ArrowLeftRegular } from '@fluentui/react-icons'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { SIDEBAR_TOP_MENU_ICON_SIZE, sidebarTopMenuIcon, motion } from '../../theme/mixins'
import {
  MOBILE_HEADER_ICON_SIZE,
  mobileHeaderBar,
} from '../../theme/mobileChrome'
import { DESKTOP_PAGE_HEADER_HEIGHT } from '../../theme/desktopPageChrome'
import { opptrixCssVars } from '../../theme/tokens'

const useStyles = makeStyles({
  /**
   * Full-bleed header hit target — same height as SessionSidebar brand row.
   * Default blends with sidebar; hover/focus paints the whole strip (not an inner chip).
   */
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexShrink: 0,
    width: '100%',
    height: `${DESKTOP_PAGE_HEADER_HEIGHT}px`,
    minHeight: `${DESKTOP_PAGE_HEADER_HEIGHT}px`,
    boxSizing: 'border-box',
    margin: 0,
    padding: '0 20px',
    border: 'none',
    borderRadius: 0,
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
    backgroundColor: 'transparent',
    color: opptrixCssVars.textPrimary,
    fontSize: '13px',
    fontWeight: 500,
    textAlign: 'left',
    cursor: 'pointer',
    transitionProperty: 'background-color, font-weight, color',
    transitionDuration: motion.fast,
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      fontWeight: 650,
    },
    ':active': {
      backgroundColor: opptrixCssVars.surfaceHover,
      fontWeight: 700,
    },
    ':focus': {
      outline: 'none',
    },
    ':focus-visible': {
      backgroundColor: opptrixCssVars.surfaceHover,
      fontWeight: 650,
      outline: 'none',
      boxShadow: `inset 0 0 0 1px ${opptrixCssVars.accent}`,
    },
  },
  label: {
    transitionProperty: 'font-weight',
    transitionDuration: motion.fast,
  },
  icon: {
    ...sidebarTopMenuIcon,
    transitionProperty: 'color',
    transitionDuration: motion.fast,
  },
  rowHoverIcon: {
    ':hover .opptrix-settings-back-icon': {
      color: opptrixCssVars.textPrimary,
    },
    ':focus-visible .opptrix-settings-back-icon': {
      color: opptrixCssVars.textPrimary,
    },
  },
  rowMobile: {
    ...mobileHeaderBar,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '10px',
    width: '100%',
    margin: 0,
    border: 'none',
    borderRadius: 0,
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
    backgroundColor: 'transparent',
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-2xl)',
    fontWeight: 600,
    textAlign: 'left',
    cursor: 'pointer',
    transitionProperty: 'background-color, font-weight, color',
    transitionDuration: motion.fast,
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      fontWeight: 700,
    },
    ':active': {
      backgroundColor: opptrixCssVars.surfaceHover,
      fontWeight: 700,
    },
    ':focus': {
      outline: 'none',
    },
    ':focus-visible': {
      backgroundColor: opptrixCssVars.surfaceHover,
      fontWeight: 700,
      outline: 'none',
      boxShadow: `inset 0 0 0 1px ${opptrixCssVars.accent}`,
    },
  },
  iconMobile: {
    color: opptrixCssVars.textSecondary,
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
  if (mobile) {
    return (
      <button
        type="button"
        className={mergeClasses(s.rowMobile, s.rowHoverIcon, 'opptrix-focusable', className)}
        onClick={onClick}
      >
        <ArrowLeftRegular
          className={mergeClasses(s.iconMobile, 'opptrix-settings-back-icon')}
          fontSize={MOBILE_HEADER_ICON_SIZE}
        />
        <span className={s.label}>返回应用</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      className={mergeClasses(s.row, s.rowHoverIcon, 'opptrix-focusable', className)}
      onClick={onClick}
    >
      <ArrowLeftRegular
        className={mergeClasses(s.icon, 'opptrix-settings-back-icon')}
        fontSize={SIDEBAR_TOP_MENU_ICON_SIZE}
      />
      <span className={s.label}>返回应用</span>
    </button>
  )
}
