import { useState, useRef, useCallback, memo, useEffect } from 'react'
import {
  makeStyles, mergeClasses,
} from '@fluentui/react-components'
import { SettingsRegular, DeleteRegular, DismissRegular, NewsRegular, ArchiveRegular, GlobeRegular, CommentMultipleRegular, PeopleTeamRegular } from '@fluentui/react-icons'
import { ChatAddRegular } from './chatIcons'
import type { SessionMeta } from '../types/chat'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { ghostInteractive, motion, nativeIconInteractive, sidebarItemSelected, sidebarTopMenuIcon, sidebarTopMenuRow, SIDEBAR_TOP_MENU_ICON_SIZE } from '../theme/mixins'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import OpptrixSegmentedControl from '../components/opptrix/OpptrixSegmentedControl'
import ThinkingDots from '../components/ThinkingDots'
import { isElectron, electronPlatform, supportsNativeWindowVibrancy } from '../platform/detect'
import { useTheme } from '../theme/ThemeContext'
import { DESKTOP_SIDEBAR_LAYOUT_MS, DESKTOP_SIDEBAR_LAYOUT_EASE, DESKTOP_TITLEBAR_HEIGHT } from '../desktop/constants'
import OverlaySidebarShell from '../desktop/OverlaySidebarShell'
import AppUpdateNotice from '../desktop/AppUpdateNotice'
import { useAppVersion } from '../onboarding/useAppVersion'
import SessionArchiveFolderMenu from './SessionArchiveFolderMenu'
import SessionSidebarArchivePanel, { type ArchiveFolderGroup } from './SessionSidebarArchivePanel'
import ExpertSessionIcon from './ExpertSessionIcon'
import HoverMarqueeText from './HoverMarqueeText'
import ComposerTooltipMenu, { ComposerTooltipMenuItem } from './ComposerTooltipMenu'

export type SidebarMode = 'panel' | 'drawer' | 'overlay'
export type SidebarListTab = 'chat' | 'experts' | 'archive'

const useStyles = makeStyles({
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: 'transparent',
    flexShrink: 0,
  },
  sidebarWeb: {
    backgroundColor: opptrixCssVars.canvasAlt,
  },
  panelShell: {
    flexShrink: 0,
    width: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    transitionProperty: 'width',
    transitionDuration: `${DESKTOP_SIDEBAR_LAYOUT_MS}ms`,
    transitionTimingFunction: DESKTOP_SIDEBAR_LAYOUT_EASE,
    backgroundColor: 'transparent',
  },
  panelShellVisible: {
    pointerEvents: 'auto',
  },
  sidebarPanel: {
    height: '100%',
    opacity: 0,
    transform: 'translateX(-8px)',
    transitionProperty: 'opacity, transform',
    transitionDuration: `${DESKTOP_SIDEBAR_LAYOUT_MS}ms`,
    transitionTimingFunction: DESKTOP_SIDEBAR_LAYOUT_EASE,
  },
  sidebarPanelVisible: {
    opacity: 1,
    transform: 'translateX(0)',
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
  /** Mobile push shell：宽 0↔drawer，挤开主列（非 fixed 遮罩） */
  drawerShell: {
    flexShrink: 0,
    width: 0,
    height: '100%',
    overflow: 'hidden',
    pointerEvents: 'none',
    transitionProperty: 'width',
    transitionDuration: `${DESKTOP_SIDEBAR_LAYOUT_MS}ms`,
    transitionTimingFunction: DESKTOP_SIDEBAR_LAYOUT_EASE,
    backgroundColor: opptrixCssVars.canvasAlt,
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '1ms',
    },
  },
  drawerShellOpen: {
    width: opptrixTokens.mobileDrawerWidth,
    maxWidth: '300px',
    pointerEvents: 'auto',
  },
  sidebarDrawer: {
    width: opptrixTokens.mobileDrawerWidth,
    maxWidth: '300px',
    height: '100%',
    boxSizing: 'border-box',
    paddingTop: 'env(safe-area-inset-top)',
    paddingBottom: 'env(safe-area-inset-bottom)',
    backgroundColor: opptrixCssVars.canvasAlt,
    borderRight: `1px solid ${opptrixCssVars.separator}`,
    opacity: 0,
    transform: 'translate3d(-12px, 0, 0)',
    transitionProperty: 'opacity, transform',
    transitionDuration: `${DESKTOP_SIDEBAR_LAYOUT_MS}ms`,
    transitionTimingFunction: DESKTOP_SIDEBAR_LAYOUT_EASE,
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '1ms',
    },
  },
  sidebarDrawerOpen: {
    opacity: 1,
    transform: 'translate3d(0, 0, 0)',
  },
  drawerHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: '8px 8px 0',
  },
  brandRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '6px',
    flexShrink: 0,
    minWidth: 0,
    /* 与 sidebarTopMenuRow 图标左缘对齐：margin 10 + padding 10 = 20 */
    padding: '4px 20px 0',
    overflow: 'hidden',
    lineHeight: 1,
  },
  brandName: {
    flexShrink: 0,
    /* Slightly above menu (13px); bold; secondary gray (not pure black) */
    fontSize: '14px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    lineHeight: 1,
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'nowrap',
  },
  brandVersion: {
    fontSize: '11px',
    fontWeight: 500,
    lineHeight: 1,
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  menuSection: {
    marginTop: '15px',
    flexShrink: 0,
    position: 'relative',
    zIndex: 1,
    isolation: 'isolate',
  },
  /* Non-mac Electron: brand lives in WindowFrameTitleBar — tighten top gap */
  menuSectionCompact: {
    marginTop: '6px',
  },
  menuRow: {
    ...sidebarTopMenuRow,
    marginBottom: '6px',
  },
  menuRowActive: {
    backgroundColor: opptrixCssVars.accentSoft,
  },
  menuIcon: sidebarTopMenuIcon,
  sectionLabel: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    padding: '6px 14px 2px',
  },
  listTabWrap: {
    margin: '19px 8px 6px',
    flexShrink: 0,
  },
  chatListWrap: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  item: {...ghostInteractive,

    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 10px',
    minHeight: '30px',
    borderRadius: opptrixTokens.radiusMd,
    color: opptrixCssVars.textPrimary,
':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
    },
  },
  itemActive: {...sidebarItemSelected,

  },
  itemTitle: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    overflow: 'hidden',
  },
  itemTitleText: {
    flex: 1,
    minWidth: 0,
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 500,
    color: 'inherit',
  },
  itemTrailing: {
    position: 'relative',
    flexShrink: 0,
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    transitionProperty: 'min-width',
    transitionDuration: motion.fast,
  },
  itemSpinner: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: opptrixCssVars.textTertiary,
  },
  itemDate: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    transitionProperty: 'opacity',
    transitionDuration: motion.fast,
    '@media (hover: none)': {
      display: 'none',
    },
  },
  itemDelete: {
    ...nativeIconInteractive,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 0,
    position: 'absolute',
    right: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    opacity: 0,
    pointerEvents: 'none',
    '@media (hover: none)': {
      opacity: 1,
      pointerEvents: 'auto',
    },
  },
  itemArchive: {
    ...nativeIconInteractive,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 0,
    position: 'absolute',
    right: '18px',
    top: '50%',
    transform: 'translateY(-50%)',
    opacity: 0,
    pointerEvents: 'none',
    '@media (hover: none)': {
      opacity: 1,
      pointerEvents: 'auto',
    },
  },
  empty: {
    padding: '32px 16px',
    textAlign: 'center',
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.6,
    whiteSpace: 'pre-line',
  },
  footer: {
    padding: '8px',
    marginTop: 'auto',
  },
  settingsBtnWrap: {
    display: 'block',
    width: '100%',
  },
  settingsBtn: {
    width: '100%',
    justifyContent: 'flex-start',
    color: opptrixCssVars.textSecondary,
    fontWeight: 500,
    minHeight: '32px',
    paddingTop: '5px',
    paddingBottom: '5px',
    borderRadius: opptrixTokens.radiusMd,
  },
  iconBtn: {
    minWidth: '36px',
    height: '36px',
    borderRadius: opptrixTokens.radiusMd,
    color: opptrixCssVars.textTertiary,
  },
})

interface SessionSidebarProps {
  mode: SidebarMode
  width: number
  isDragging?: boolean
  visible?: boolean
  drawerOpen?: boolean
  sessions: SessionMeta[]
  activeId: string | null
  activeRoute?: 'chat' | 'news' | 'market' | 'community' | 'experts'
  /** ids of sessions currently streaming a response (shows thinking dot) */
  busySessionIds?: readonly string[]
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onArchive: (id: string, folderId: string) => void
  onOpenSearch?: () => void
  onOpenExpertCenter: () => void
  onOpenSystemSettings: () => void
  onOpenNewsCenter: () => void
  onOpenMarketDynamics: () => void
  onOpenCommunityFeed: () => void
  onClose?: () => void
  listTab?: SidebarListTab
  onListTabChange?: (tab: SidebarListTab) => void
  archivedGroups?: ArchiveFolderGroup[]
  onCreateArchiveFolder?: (title: string) => void | Promise<void>
  onRenameArchiveFolder?: (id: string, title: string) => void | Promise<void>
  onDeleteArchiveFolder?: (id: string) => void | Promise<void>
  onClearArchiveFolder?: (id: string) => void | Promise<void>
  onDeleteArchivedSession?: (id: string) => void | Promise<void>
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

function SessionSidebar({
  mode, width, isDragging = false, visible = true, drawerOpen = false,
  sessions, activeId, activeRoute = 'chat', busySessionIds = [],
  onSelect, onNew, onDelete, onArchive, onOpenExpertCenter, onOpenSystemSettings,
  onOpenNewsCenter, onOpenMarketDynamics, onOpenCommunityFeed, onClose,
  listTab: listTabProp,
  onListTabChange,
  archivedGroups = [],
  onCreateArchiveFolder,
  onRenameArchiveFolder,
  onDeleteArchiveFolder,
  onClearArchiveFolder,
  onDeleteArchivedSession,
}: SessionSidebarProps) {
  const s = useStyles()
  const { resolvedScheme } = useTheme()
  const { label: versionLabel } = useAppVersion()
  const isDrawer = mode === 'drawer'
  const isOverlay = mode === 'overlay'
  const electronChrome = isElectron() && !isDrawer
  /* Brand row stays on mac / Web / drawer; non-mac Electron uses WindowFrameTitleBar */
  const showSidebarBrand = isDrawer || !(isElectron() && electronPlatform() !== 'darwin')
  const nativeVibrancy = supportsNativeWindowVibrancy()
  // 原生毛玻璃时深浅色都透明穿透；无原生时仅浅色用 CSS glass，深色实底
  const sidebarGlass = electronChrome && (nativeVibrancy || resolvedScheme !== 'dark')
  const sidebarSolidDark = electronChrome && !nativeVibrancy && resolvedScheme === 'dark'
  const [listTabState, setListTabState] = useState<SidebarListTab>('chat')
  const listTab = listTabProp ?? listTabState
  const setListTab = useCallback((tab: SidebarListTab) => {
    if (listTabProp == null) setListTabState(tab)
    onListTabChange?.(tab)
  }, [listTabProp, onListTabChange])
  const [archiveMenu, setArchiveMenu] = useState<{ sessionId: string; anchor: HTMLElement } | null>(null)
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false)
  const settingsBtnRef = useRef<HTMLSpanElement>(null)
  const archiveAnchorRef = useRef<HTMLElement | null>(null)
  archiveAnchorRef.current = archiveMenu?.anchor ?? null

  const brandAriaLabel = versionLabel
    ? `Opptrix 工作台 ${versionLabel}`
    : 'Opptrix 工作台'

  const releaseSidebarFocus = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  }, [])

  const handleSelect = (id: string) => {
    // Clear any lingering :focus / :hover-visible in the sidebar so the user
    // lands cleanly in the chat area. We intentionally do NOT force the tab
    // back to 'chat': when a session is picked from the archive panel it stays
    // visible inside its folder (with the busy spinner) while the user keeps
    // chatting, instead of jumping away to the chat tab.
    releaseSidebarFocus()
    onSelect(id)
    if (isDrawer || isOverlay) onClose?.()
  }

  const handleTopMenuClick = useCallback((action: () => void) => {
    return () => {
      releaseSidebarFocus()
      action()
    }
  }, [releaseSidebarFocus])

  useEffect(() => {
    setSettingsMenuOpen(false)
  }, [activeRoute])

  const sidebarBody = (
    <>
      {isDrawer && (
        <div className={s.drawerHead}>
          <OpptrixButton className={s.iconBtn} variant="ghost" icon={<DismissRegular />} onClick={onClose} aria-label="关闭" />
        </div>
      )}

      {showSidebarBrand ? (
        <div className={s.brandRow} aria-label={brandAriaLabel}>
          <span className={s.brandName} aria-hidden="true">Opptrix 工作台</span>
          {versionLabel ? (
            <span className={s.brandVersion} aria-hidden="true">{versionLabel}</span>
          ) : null}
        </div>
      ) : null}

      <div className={mergeClasses(
        s.menuSection,
        !showSidebarBrand && s.menuSectionCompact,
        'opptrix-sidebar-menu',
      )}>
      <button type="button" className={mergeClasses(s.menuRow, 'opptrix-focusable')} onClick={handleTopMenuClick(onNew)}>
        <ChatAddRegular className={s.menuIcon} fontSize={SIDEBAR_TOP_MENU_ICON_SIZE} />
        <span>新对话</span>
      </button>

      <button
        type="button"
        className={mergeClasses(
          s.menuRow,
          'opptrix-focusable',
          activeRoute === 'news' && s.menuRowActive,
        )}
        onClick={handleTopMenuClick(onOpenNewsCenter)}
      >
        <NewsRegular className={s.menuIcon} fontSize={SIDEBAR_TOP_MENU_ICON_SIZE} />
        <span>新闻中心</span>
      </button>

      <button
        type="button"
        className={mergeClasses(
          s.menuRow,
          'opptrix-focusable',
          activeRoute === 'market' && s.menuRowActive,
        )}
        onClick={handleTopMenuClick(onOpenMarketDynamics)}
      >
        <GlobeRegular className={s.menuIcon} fontSize={SIDEBAR_TOP_MENU_ICON_SIZE} />
        <span>市场动态</span>
      </button>

      <button
        type="button"
        className={mergeClasses(
          s.menuRow,
          'opptrix-focusable',
          activeRoute === 'community' && s.menuRowActive,
        )}
        onClick={handleTopMenuClick(onOpenCommunityFeed)}
      >
        <CommentMultipleRegular className={s.menuIcon} fontSize={SIDEBAR_TOP_MENU_ICON_SIZE} />
        <span>社区讨论</span>
      </button>
      </div>

      <div className={s.listTabWrap}>
        <OpptrixSegmentedControl
          aria-label="对话列表"
          variant="embedded"
          value={listTab}
          options={[
            { value: 'chat', label: '对话' },
            { value: 'experts', label: '专家' },
            { value: 'archive', label: '归档' },
          ]}
          onChange={setListTab}
        />
      </div>

      {listTab === 'chat' || listTab === 'experts' ? (
      <div className={s.chatListWrap}>
      <div className={mergeClasses(s.list, 'opptrix-scroll', 'opptrix-scroll-hover')}>
        {sessions.length === 0 && (
          <div className={s.empty}>
            {listTab === 'experts'
              ? '还没有专家对话\n去「专家中心」挑选一位，开始专属研讨'
              : '暂无历史对话'}
          </div>
        )}
        {sessions.map(sess => {
          // Only show the active highlight when we're in the chat view; if the
          // user navigated away to news / market, clear the highlight so any
          // session row can be clicked (including the current one) to jump
          // back into the chat area.
          const active = activeRoute === 'chat' && sess.id === activeId
          const busy = busySessionIds.includes(sess.id)
          return (
            <div
              key={sess.id}
              className={mergeClasses(
                'opptrix-session-item',
                'opptrix-hover-marquee-host',
                'opptrix-focusable',
                s.item,
                active && s.itemActive,
                active && 'opptrix-session-item-active',
                busy && 'opptrix-session-item-busy',
              )}
              onClick={() => handleSelect(sess.id)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && handleSelect(sess.id)}
            >
              <span className={s.itemTitle}>
                {(sess.expertId || sess.expertIcon) && <ExpertSessionIcon />}
                <HoverMarqueeText text={sess.title} className={s.itemTitleText} />
              </span>
              <span className={mergeClasses(s.itemTrailing, 'opptrix-session-trailing')}>
                {busy && <ThinkingDots className={s.itemSpinner} label="" />}
                <span className={mergeClasses(s.itemDate, 'opptrix-session-date')}>{formatDate(sess.updatedAt)}</span>
                <button
                  type="button"
                  className={mergeClasses(s.itemArchive, 'opptrix-session-archive', 'opptrix-focusable')}
                  onClick={e => {
                    e.stopPropagation()
                    setArchiveMenu({ sessionId: sess.id, anchor: e.currentTarget })
                  }}
                  aria-label="归档对话"
                >
                  <ArchiveRegular fontSize={14} />
                </button>
                <button
                  type="button"
                  className={mergeClasses(s.itemDelete, 'opptrix-session-delete', 'opptrix-focusable')}
                  onClick={e => { e.stopPropagation(); onDelete(sess.id) }}
                  aria-label="删除对话"
                >
                  <DeleteRegular fontSize={14} />
                </button>
              </span>
            </div>
          )
        })}
      </div>
      </div>
      ) : (
        onCreateArchiveFolder && onRenameArchiveFolder && onDeleteArchiveFolder && onDeleteArchivedSession ? (
          <SessionSidebarArchivePanel
            groups={archivedGroups}
            activeId={activeId}
            activeRoute={activeRoute}
            busySessionIds={busySessionIds}
            onSelect={handleSelect}
            onDeleteSession={onDeleteArchivedSession}
            onCreateFolder={onCreateArchiveFolder}
            onRenameFolder={onRenameArchiveFolder}
            onDeleteFolder={onDeleteArchiveFolder}
            onClearFolder={onClearArchiveFolder}
          />
        ) : (
          <div className={s.empty}>归档功能加载中…</div>
        )
      )}

      <div className={s.footer}>
        <AppUpdateNotice />
        <span ref={settingsBtnRef} className={s.settingsBtnWrap}>
        <OpptrixButton
          className={s.settingsBtn}
          variant="ghost"
          icon={<SettingsRegular />}
          onClick={() => setSettingsMenuOpen(open => !open)}
          aria-expanded={settingsMenuOpen}
          aria-haspopup="menu"
        >
          设置
        </OpptrixButton>
        </span>
        <ComposerTooltipMenu
          open={settingsMenuOpen}
          anchorRef={settingsBtnRef}
          align="start"
          width={220}
          maxHeight={160}
          ariaLabel="设置菜单"
          onClose={() => setSettingsMenuOpen(false)}
        >
          <div className="opptrix-session-tools-menu">
          <ComposerTooltipMenuItem
            onClick={() => {
              setSettingsMenuOpen(false)
              onOpenExpertCenter()
            }}
          >
            <PeopleTeamRegular fontSize={16} />
            <span>专家中心</span>
          </ComposerTooltipMenuItem>
          <ComposerTooltipMenuItem
            onClick={() => {
              setSettingsMenuOpen(false)
              onOpenSystemSettings()
            }}
          >
            <SettingsRegular fontSize={16} />
            <span>系统设置</span>
          </ComposerTooltipMenuItem>
          </div>
        </ComposerTooltipMenu>
      </div>

      <SessionArchiveFolderMenu
        open={archiveMenu != null}
        anchorRef={archiveAnchorRef}
        onClose={() => setArchiveMenu(null)}
        onSelect={folderId => {
          if (archiveMenu) onArchive(archiveMenu.sessionId, folderId)
          setArchiveMenu(null)
        }}
      />
    </>
  )

  if (isOverlay) {
    return (
      <OverlaySidebarShell
        open={visible}
        width={`${width}px`}
        onClose={onClose}
      >
        <div
          className={mergeClasses(
            s.sidebar,
            electronChrome && s.sidebarElectron,
            electronChrome && s.sidebarTopElectron,
          )}
        >
          {sidebarBody}
        </div>
      </OverlaySidebarShell>
    )
  }

  const sidebarEl = (
    <aside
      className={mergeClasses(
        s.sidebar,
        isDrawer && s.sidebarDrawer,
        !isDrawer && s.sidebarPanel,
        !isDrawer && visible && s.sidebarPanelVisible,
        isDrawer && drawerOpen && s.sidebarDrawerOpen,
        !electronChrome && !isDrawer && s.sidebarWeb,
        electronChrome && s.sidebarElectron,
        sidebarSolidDark && s.sidebarElectronSolid,
        electronChrome && s.sidebarTopElectron,
        sidebarGlass && 'opptrix-glass-sidebar',
        isDrawer && 'opptrix-sidebar-edge',
      )}
      style={!isDrawer ? { width, minWidth: width } : undefined}
    >
      {sidebarBody}
    </aside>
  )

  if (isDrawer) {
    return (
      <div
        className={mergeClasses(s.drawerShell, drawerOpen && s.drawerShellOpen)}
        aria-hidden={!drawerOpen}
      >
        {sidebarEl}
      </div>
    )
  }

  return (
    <div
      className={mergeClasses(s.panelShell, visible && s.panelShellVisible)}
      style={{
        width: visible ? width : 0,
        transitionProperty: isDragging ? 'none' : 'width',
      }}
    >
      {sidebarEl}
    </div>
  )
}

export default memo(SessionSidebar)
