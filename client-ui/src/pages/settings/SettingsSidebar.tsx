import { useMemo } from 'react'
import { Input, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  BotRegular,
  InfoRegular,
  SearchRegular,
  SettingsRegular,
} from '@fluentui/react-icons'
import { innoTokens } from '../../theme/tokens'
import { ghostInteractive, inputShellInteractive, motion, sidebarItemSelected, sidebarTopMenuIcon, sidebarTopMenuRow, SIDEBAR_TOP_MENU_ICON_SIZE } from '../../theme/mixins'
import { isElectron } from '../../platform/detect'
import { DESKTOP_TITLEBAR_HEIGHT } from '../../desktop/constants'
import OverlaySidebarShell from '../../desktop/OverlaySidebarShell'
import SettingsBackRow from './SettingsBackRow'

export type SettingsSection = 'general' | 'models' | 'about'
export type SettingsSidebarMode = 'panel' | 'overlay'

const NAV: { id: SettingsSection; label: string; icon: typeof SettingsRegular }[] = [
  { id: 'general', label: '常规', icon: SettingsRegular },
  { id: 'models', label: '模型', icon: BotRegular },
  { id: 'about', label: '关于', icon: InfoRegular },
]

const useStyles = makeStyles({
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    width: innoTokens.settingsSidebarWidth,
    minWidth: innoTokens.settingsSidebarWidth,
    height: '100%',
    flexShrink: 0,
    backgroundColor: 'transparent',
  },
  sidebarWeb: {
    backgroundColor: innoTokens.canvasAlt,
  },
  sidebarElectron: {
    backgroundColor: 'transparent',
  },
  sidebarTopElectron: {
    paddingTop: `${DESKTOP_TITLEBAR_HEIGHT + 4}px`,
    boxSizing: 'border-box',
    height: '100%',
  },
  sidebarMobile: {
    width: '100%',
    minWidth: 'unset',
    height: 'auto',
    backgroundColor: innoTokens.canvas,
  },
  searchWrap: {
    padding: '8px 12px 6px',
  },
  searchWrapOverlay: {
    padding: '8px 10px 6px',
  },
  searchShell: {
    ...inputShellInteractive,
    padding: '0 8px',
    minHeight: '28px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  nav: {
    flex: 1,
    overflowY: 'auto',
    padding: '2px 8px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  navOverlay: {
    padding: '2px 0 16px',
    gap: '2px',
  },
  navMobile: {
    flex: 'unset',
    flexDirection: 'row',
    gap: '6px',
    overflowX: 'auto',
    padding: '8px 12px 12px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    padding: '5px 8px',
    borderRadius: innoTokens.radiusMd,
    cursor: 'pointer',
    border: 'none',
    backgroundColor: 'transparent',
    color: innoTokens.textPrimary,
    fontSize: '13px',
    fontWeight: 500,
    width: '100%',
    textAlign: 'left',
    transitionProperty: 'background-color',
    transitionDuration: motion.fast,
    ...ghostInteractive,
  },
  navItemOverlay: {
    ...sidebarTopMenuRow,
    marginBottom: 0,
    transitionProperty: 'background-color',
    transitionDuration: motion.fast,
  },
  navItemMobile: {
    width: 'auto',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  navItemActive: {
    ...sidebarItemSelected,
  },
  navIcon: {
    color: innoTokens.textTertiary,
    flexShrink: 0,
  },
  navIconOverlay: sidebarTopMenuIcon,
  navIconActive: {
    color: innoTokens.textPrimary,
  },
})

interface SettingsSidebarProps {
  mode?: SettingsSidebarMode
  visible?: boolean
  onClose?: () => void
  active: SettingsSection
  onSelect: (section: SettingsSection) => void
  onBack?: () => void
  search: string
  onSearchChange: (value: string) => void
  isMobile?: boolean
}

export default function SettingsSidebar({
  mode = 'panel',
  visible = true,
  onClose,
  active, onSelect, onBack, search, onSearchChange, isMobile = false,
}: SettingsSidebarProps) {
  const s = useStyles()
  const isOverlay = mode === 'overlay'
  const electronChrome = isElectron() && !isMobile && !isOverlay

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return NAV
    return NAV.filter(item => item.label.toLowerCase().includes(q))
  }, [search])

  const body = (
    <>
      {onBack && <SettingsBackRow onClick={onBack} />}

      {!isMobile && (
        <div className={mergeClasses(s.searchWrap, isOverlay && s.searchWrapOverlay)}>
          <div className={mergeClasses(s.searchShell, 'inno-input-shell', 'inno-settings-search-shell')}>
            <SearchRegular fontSize={14} color={innoTokens.textTertiary} />
            <Input
              className="inno-settings-search"
              appearance="filled-darker"
              contentBefore={null}
              placeholder="搜索设置…"
              value={search}
              onChange={(_, d) => onSearchChange(d.value)}
            />
          </div>
        </div>
      )}

      <nav className={mergeClasses(s.nav, isOverlay && s.navOverlay, isMobile && s.navMobile, 'inno-scroll')}>
        {filtered.map(item => {
          const Icon = item.icon
          const isActive = active === item.id
          return (
            <button
              key={item.id}
              type="button"
              className={mergeClasses(
                s.navItem,
                isOverlay && s.navItemOverlay,
                isMobile && s.navItemMobile,
                isActive && s.navItemActive,
                isActive && 'inno-settings-nav-item-active',
                'inno-focusable',
              )}
              onClick={() => onSelect(item.id)}
            >
              <Icon
                className={mergeClasses(
                  s.navIcon,
                  isOverlay && s.navIconOverlay,
                  isActive && s.navIconActive,
                )}
                fontSize={isOverlay ? SIDEBAR_TOP_MENU_ICON_SIZE : 17}
              />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>
    </>
  )

  if (isOverlay) {
    return (
      <OverlaySidebarShell
        open={visible}
        width={innoTokens.settingsSidebarWidth}
        onClose={onClose}
      >
        <div className={mergeClasses(s.sidebar, s.sidebarTopElectron)}>
          {body}
        </div>
      </OverlaySidebarShell>
    )
  }

  return (
    <aside
      className={mergeClasses(
        s.sidebar,
        isMobile && s.sidebarMobile,
        !electronChrome && !isMobile && s.sidebarWeb,
        electronChrome && s.sidebarElectron,
        electronChrome && s.sidebarTopElectron,
        electronChrome && 'inno-glass-sidebar',
        'inno-sidebar-edge',
      )}
    >
      {body}
    </aside>
  )
}

export function settingsSectionTitle(section: SettingsSection): string {
  return NAV.find(n => n.id === section)?.label ?? '设置'
}

export function settingsSectionSubtitle(section: SettingsSection): string {
  switch (section) {
    case 'general':
      return '管理默认评分卡与后端连接状态'
    case 'models':
      return '配置 LLM 提供商与可用模型'
    case 'about':
      return '应用版本与运行说明'
    default:
      return ''
  }
}
