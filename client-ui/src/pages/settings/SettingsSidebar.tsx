import { useMemo } from 'react'
import { Input, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  BotRegular,
  ChartMultipleRegular,
  DatabaseRegular,
  ImageRegular,
  InfoRegular,
  NewsRegular,
  SearchRegular,
  SettingsRegular,
  TranslateRegular,
} from '@fluentui/react-icons'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'
import { ghostInteractive, inputShellInteractive, motion, sidebarItemSelected, sidebarTopMenuIcon, sidebarTopMenuRow, SIDEBAR_TOP_MENU_ICON_SIZE } from '../../theme/mixins'
import { isElectron } from '../../platform/detect'
import { useTheme } from '../../theme/ThemeContext'
import { DESKTOP_TITLEBAR_HEIGHT } from '../../desktop/constants'
import OverlaySidebarShell from '../../desktop/OverlaySidebarShell'
import SettingsBackRow from './SettingsBackRow'

export type SettingsSection = 'general' | 'models' | 'market_data' | 'discover_strategies' | 'news_feed' | 'translation' | 'multimodal' | 'about'
export type SettingsSidebarMode = 'panel' | 'overlay'

const NAV: { id: SettingsSection; label: string; icon: typeof SettingsRegular }[] = [
  { id: 'general', label: '常规', icon: SettingsRegular },
  { id: 'models', label: '模型', icon: BotRegular },
  { id: 'market_data', label: '基础数据', icon: DatabaseRegular },
  { id: 'discover_strategies', label: '选股策略', icon: ChartMultipleRegular },
  { id: 'news_feed', label: '新闻订阅', icon: NewsRegular },
  { id: 'translation', label: '翻译', icon: TranslateRegular },
  { id: 'multimodal', label: '多模态', icon: ImageRegular },
  { id: 'about', label: '关于', icon: InfoRegular },
]

const useStyles = makeStyles({
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    width: opptrixTokens.settingsSidebarWidth,
    minWidth: opptrixTokens.settingsSidebarWidth,
    height: '100%',
    flexShrink: 0,
    backgroundColor: 'transparent',
  },
  sidebarWeb: {
    backgroundColor: opptrixCssVars.canvasAlt,
  },
  sidebarElectron: {
    backgroundColor: 'transparent',
  },
  sidebarElectronSolid: {
    backgroundColor: opptrixCssVars.canvasAlt,
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
    backgroundColor: opptrixCssVars.canvas,
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
    borderRadius: opptrixTokens.radiusMd,
    cursor: 'pointer',
    border: 'none',
    backgroundColor: 'transparent',
    color: opptrixCssVars.textPrimary,
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
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
  },
  navIconOverlay: sidebarTopMenuIcon,
  navIconActive: {
    color: opptrixCssVars.textPrimary,
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
  const { resolvedScheme } = useTheme()
  const isOverlay = mode === 'overlay'
  const electronChrome = isElectron() && !isMobile && !isOverlay
  const sidebarGlass = electronChrome && resolvedScheme !== 'dark'

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
          <div className={mergeClasses(s.searchShell, 'opptrix-input-shell', 'opptrix-settings-search-shell')}>
            <SearchRegular fontSize={14} color={opptrixCssVars.textTertiary} />
            <Input
              className="opptrix-settings-search"
              appearance="filled-darker"
              contentBefore={null}
              placeholder="搜索设置…"
              value={search}
              onChange={(_, d) => onSearchChange(d.value)}
            />
          </div>
        </div>
      )}

      <nav className={mergeClasses(s.nav, isOverlay && s.navOverlay, isMobile && s.navMobile, 'opptrix-scroll')}>
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
                isActive && 'opptrix-settings-nav-item-active',
                'opptrix-focusable',
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
        width={opptrixTokens.settingsSidebarWidth}
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
        electronChrome && resolvedScheme === 'dark' && s.sidebarElectronSolid,
        electronChrome && s.sidebarTopElectron,
        sidebarGlass && 'opptrix-glass-sidebar',
        'opptrix-sidebar-edge',
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
    case 'market_data':
      return '本地行情库、数据源与同步'
    case 'discover_strategies':
      return '查看内置策略、管理自编策略与复制编辑'
    case 'news_feed':
      return '管理 RSS 订阅与资讯更新频率'
    case 'translation':
      return '配置新闻阅读的离线翻译与远程大模型回退'
    case 'multimodal':
      return '配置图片 OCR、语音转写与文章媒体自动提取策略'
    case 'about':
      return '应用版本与运行说明'
    default:
      return ''
  }
}
