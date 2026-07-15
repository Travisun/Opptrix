import { useMemo } from 'react'
import { Input, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  BotRegular,
  ImageRegular,
  InfoRegular,
  NewsRegular,
  SearchRegular,
  SettingsRegular,
  TranslateRegular,
  ServerRegular,
  PlugConnectedRegular,
} from '@fluentui/react-icons'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'
import { ghostInteractive, inputShellInteractive, motion, sidebarItemSelected, sidebarTopMenuIcon, sidebarTopMenuRow, SIDEBAR_TOP_MENU_ICON_SIZE } from '../../theme/mixins'
import { isElectron, supportsNativeWindowVibrancy } from '../../platform/detect'
import { useTheme } from '../../theme/ThemeContext'
import { DESKTOP_TITLEBAR_HEIGHT } from '../../desktop/constants'
import OverlaySidebarShell from '../../desktop/OverlaySidebarShell'
import SettingsBackRow from './SettingsBackRow'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import AppUpdateNotice from '../../desktop/AppUpdateNotice'
import {
  searchSettingsEntries,
  settingsSectionLabel,
  type SettingsSearchEntry,
} from './settingsSearchIndex'
import type { SettingsSection } from './settingsTypes'
import { listRowKey } from '../../utils/listRowKey'

export type { SettingsSection } from './settingsTypes'
export type SettingsSidebarMode = 'panel' | 'overlay'

const NAV: { id: SettingsSection; label: string; icon: typeof SettingsRegular }[] = [
  { id: 'general', label: '常规', icon: SettingsRegular },
  { id: 'models', label: '模型', icon: BotRegular },
  { id: 'data_providers', label: '数据源', icon: ServerRegular },
  { id: 'mcp_servers', label: 'MCP 服务器', icon: PlugConnectedRegular },
  { id: 'news_feed', label: '新闻订阅', icon: NewsRegular },
  { id: 'translation', label: '翻译', icon: TranslateRegular },
  { id: 'multimodal', label: '多模态', icon: ImageRegular },
  { id: 'about', label: '关于 Opptrix', icon: InfoRegular },
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
  searchShell: {...inputShellInteractive,
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
  navItem: {...ghostInteractive,

    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 10px',
    borderRadius: opptrixTokens.radiusMd,
    cursor: 'pointer',
    border: 'none',
    backgroundColor: 'transparent',
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 400,
    width: '100%',
    textAlign: 'left',
    transitionProperty: 'background-color, color',
    transitionDuration: motion.fast,
    transitionTimingFunction: motion.ease,
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
    backgroundColor: opptrixCssVars.sidebarSelected,
    color: opptrixCssVars.textPrimary,
    fontWeight: 500,
  },
  navIcon: {
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
  },
  navIconOverlay: sidebarTopMenuIcon,
  navIconActive: {
    color: opptrixCssVars.textPrimary,
  },
  searchResults: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '2px 8px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  searchResultsOverlay: {
    padding: '2px 0 16px',
  },
  searchHit: {...ghostInteractive,
display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '1px',
    width: '100%',
    padding: '6px 8px',
    borderRadius: opptrixTokens.radiusMd,
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
  },
  searchHitTitle: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 500,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
  },
  searchHitMeta: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.35,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '100%',
  },
  searchEmpty: {
    padding: '16px 10px',
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
    textAlign: 'center',
  },
  footer: {
    flexShrink: 0,
    padding: '0 8px 8px',
    marginTop: 'auto',
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
  dynamicSearchEntries?: SettingsSearchEntry[]
  isMobile?: boolean
}

export default function SettingsSidebar({
  mode = 'panel',
  visible = true,
  onClose,
  active, onSelect, onBack, search, onSearchChange, dynamicSearchEntries = [], isMobile = false,
}: SettingsSidebarProps) {
  const s = useStyles()
  const { resolvedScheme } = useTheme()
  const isOverlay = mode === 'overlay'
  const electronChrome = isElectron() && !isMobile && !isOverlay
  const nativeVibrancy = supportsNativeWindowVibrancy()
  const sidebarGlass = electronChrome && (nativeVibrancy || resolvedScheme !== 'dark')
  const sidebarSolidDark = electronChrome && !nativeVibrancy && resolvedScheme === 'dark'

  const searchActive = Boolean(search.trim()) && !isMobile

  const searchHits = useMemo(
    () => searchSettingsEntries(search, dynamicSearchEntries),
    [search, dynamicSearchEntries],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return NAV
    const matched = new Set(searchHits.map(hit => hit.section))
    return NAV.filter(item => matched.has(item.id))
  }, [search, searchHits])

  const pickSection = (section: SettingsSection) => {
    onSelect(section)
    if (isOverlay) onClose?.()
  }

  const pickSearchHit = (hit: SettingsSearchEntry) => {
    pickSection(hit.section)
    onSearchChange('')
  }

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

      <nav className={mergeClasses(
        searchActive ? s.searchResults : s.nav,
        isOverlay && (searchActive ? s.searchResultsOverlay : s.navOverlay),
        isMobile && s.navMobile,
        'opptrix-scroll',
      )}>
        {searchActive && searchHits.length === 0 && (
          <div className={s.searchEmpty}>没有匹配的设置项</div>
        )}

        {searchActive && searchHits.map((hit, index) => (
          <OpptrixButton
            key={listRowKey(index, hit.section, hit.group, hit.title)}
            variant="ghost"
            block
            className={mergeClasses(s.searchHit, 'opptrix-focusable')}
            onClick={() => pickSearchHit(hit)}
          >
            <span className={s.searchHitTitle}>{hit.title}</span>
            <span className={s.searchHitMeta}>
              {[settingsSectionLabel(hit.section), hit.group].filter(Boolean).join(' · ')}
              {hit.desc ? ` · ${hit.desc}` : ''}
            </span>
          </OpptrixButton>
        ))}

        {!searchActive && filtered.map(item => {
          const Icon = item.icon
          const isActive = active === item.id
          return (
            <OpptrixButton
              key={item.id}
              variant="ghost"
              block
              className={mergeClasses(
                s.navItem,
                isOverlay && s.navItemOverlay,
                isMobile && s.navItemMobile,
                isActive && s.navItemActive,
                isActive && 'opptrix-settings-nav-item-active',
                'opptrix-focusable',
              )}
              onClick={() => pickSection(item.id)}
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
            </OpptrixButton>
          )
        })}
      </nav>

      {!isMobile && (
        <div className={s.footer}>
          <AppUpdateNotice />
        </div>
      )}
    </>
  )

  if (isOverlay) {
    return (
      <OverlaySidebarShell
        open={visible}
        width={opptrixTokens.settingsSidebarWidth}
        onClose={onClose}
      >
        <div className={mergeClasses(s.sidebar, s.sidebarTopElectron, 'opptrix-settings-sidebar')}>
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
        sidebarSolidDark && s.sidebarElectronSolid,
        electronChrome && s.sidebarTopElectron,
        sidebarGlass && 'opptrix-glass-sidebar',
        'opptrix-settings-sidebar',
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
      return '评分偏好与连接设置'
    case 'models':
      return '添加和管理 AI 模型服务'
    case 'data_providers':
      return '管理行情与资讯数据来源'
    case 'mcp_servers':
      return '接入外部智能服务'
    case 'news_feed':
      return '订阅源与更新频率'
    case 'translation':
      return '离线翻译与远程回退'
    case 'multimodal':
      return '图片、语音与媒体处理'
    case 'about':
      return '版本信息与法律说明'
    default:
      return ''
  }
}
