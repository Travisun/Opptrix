import { useState, useRef, useCallback, memo } from 'react'
import {
  makeStyles, mergeClasses,
} from '@fluentui/react-components'
import { SettingsRegular, DeleteRegular, DismissRegular, NewsRegular, ArchiveRegular, SearchRegular, GlobeRegular } from '@fluentui/react-icons'
import { ChatAddRegular } from './chatIcons'
import type { SessionMeta } from '../types/chat'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { ghostInteractive, motion, nativeIconInteractive, sidebarItemSelected, sidebarTopMenuIcon, sidebarTopMenuRow, SIDEBAR_TOP_MENU_ICON_SIZE } from '../theme/mixins'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import OpptrixSegmentedControl from '../components/opptrix/OpptrixSegmentedControl'
import ThinkingDots from '../components/ThinkingDots'
import { isElectron, supportsNativeWindowVibrancy } from '../platform/detect'
import { useTheme } from '../theme/ThemeContext'
import { DESKTOP_SIDEBAR_LAYOUT_MS, DESKTOP_SIDEBAR_LAYOUT_EASE, DESKTOP_TITLEBAR_HEIGHT } from '../desktop/constants'
import OverlaySidebarShell from '../desktop/OverlaySidebarShell'
import AppUpdateNotice from '../desktop/AppUpdateNotice'
import SessionArchiveFolderMenu from './SessionArchiveFolderMenu'
import SessionSidebarArchivePanel, { type ArchiveFolderGroup } from './SessionSidebarArchivePanel'

export type SidebarMode = 'panel' | 'drawer' | 'overlay'
export type SidebarListTab = 'chat' | 'archive'

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
    width: opptrixTokens.sidebarWidth,
    pointerEvents: 'auto',
  },
  sidebarPanel: {
    width: opptrixTokens.sidebarWidth,
    minWidth: opptrixTokens.sidebarWidth,
    height: '100%',
    opacity: 0,
    transform: 'translateX(-12px)',
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
  sidebarDrawer: {
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    width: opptrixTokens.mobileDrawerWidth,
    maxWidth: '300px',
    zIndex: 200,
    paddingTop: 'env(safe-area-inset-top)',
    paddingBottom: 'env(safe-area-inset-bottom)',
    transform: 'translateX(-100%)',
    transitionProperty: 'transform',
    transitionDuration: motion.slow,
    transitionTimingFunction: motion.easeOut,
    backgroundColor: opptrixCssVars.canvas,
    borderLeft: `1px solid ${opptrixCssVars.separator}`,
  },
  sidebarDrawerOpen: {
    transform: 'translateX(0)',
  },
  drawerHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: '8px 8px 0',
  },
  menuSection: {
    marginTop: '15px',
    flexShrink: 0,
    position: 'relative',
    zIndex: 1,
    isolation: 'isolate',
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
    fontSize: '11px',
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
    gap: '8px',
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
    fontSize: '13px',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: 'inherit',
  },
  itemTrailing: {
    position: 'relative',
    flexShrink: 0,
    width: '52px',
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  itemDate: {
    fontSize: '11px',
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
    fontSize: '13px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.6,
  },
  footer: {
    padding: '8px',
    marginTop: 'auto',
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
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    backdropFilter: 'blur(4px)',
    zIndex: 150,
    opacity: 0,
    pointerEvents: 'none',
    transitionProperty: 'opacity',
    transitionDuration: motion.slow,
  },
  backdropVisible: {
    opacity: 1,
    pointerEvents: 'auto',
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
  visible?: boolean
  drawerOpen?: boolean
  sessions: SessionMeta[]
  activeId: string | null
  activeRoute?: 'chat' | 'news' | 'market'
  /** ids of sessions currently streaming a response (shows thinking dot) */
  busySessionIds?: readonly string[]
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onArchive: (id: string, folderId: string) => void
  onOpenSearch: () => void
  onOpenSettings: () => void
  onOpenNewsCenter: () => void
  onOpenMarketDynamics: () => void
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
  mode, visible = true, drawerOpen = false,
  sessions, activeId, activeRoute = 'chat', busySessionIds = [],
  onSelect, onNew, onDelete, onArchive, onOpenSearch, onOpenSettings, onOpenNewsCenter, onOpenMarketDynamics, onClose,
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
  const isDrawer = mode === 'drawer'
  const isOverlay = mode === 'overlay'
  const electronChrome = isElectron() && !isDrawer
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
  const archiveAnchorRef = useRef<HTMLElement | null>(null)
  archiveAnchorRef.current = archiveMenu?.anchor ?? null

  const releaseSidebarFocus = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  }, [])

  const handleSelect = (id: string) => {
    // When picking a session (especially from archive panel), switch back
    // to the chat tab and clear any :focus / :hover-visible lingering in the
    // sidebar list so the user lands cleanly in the chat area.
    if (listTab !== 'chat') setListTab('chat')
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

  const sidebarBody = (
    <>
      {isDrawer && (
        <div className={s.drawerHead}>
          <OpptrixButton className={s.iconBtn} variant="ghost" icon={<DismissRegular />} onClick={onClose} aria-label="关闭" />
        </div>
      )}

      <div className={mergeClasses(s.menuSection, 'opptrix-sidebar-menu')}>
      <button type="button" className={mergeClasses(s.menuRow, 'opptrix-focusable')} onClick={handleTopMenuClick(onNew)}>
        <ChatAddRegular className={s.menuIcon} fontSize={SIDEBAR_TOP_MENU_ICON_SIZE} />
        <span>新对话</span>
      </button>

      <button type="button" className={mergeClasses(s.menuRow, 'opptrix-focusable')} onClick={handleTopMenuClick(onOpenSearch)}>
        <SearchRegular className={s.menuIcon} fontSize={SIDEBAR_TOP_MENU_ICON_SIZE} />
        <span>搜索</span>
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
      </div>

      <div className={s.listTabWrap}>
        <OpptrixSegmentedControl
          aria-label="对话列表"
          variant="embedded"
          value={listTab}
          options={[
            { value: 'chat', label: '对话' },
            { value: 'archive', label: '归档' },
          ]}
          onChange={setListTab}
        />
      </div>

      {listTab === 'chat' ? (
      <div className={s.chatListWrap}>
      <div className={mergeClasses(s.list, 'opptrix-scroll', 'opptrix-scroll-hover')}>
        {sessions.length === 0 && (
          <div className={s.empty}>暂无历史对话</div>
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
                'opptrix-focusable',
                s.item,
                active && s.itemActive,
                active && 'opptrix-session-item-active',
              )}
              onClick={() => handleSelect(sess.id)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && handleSelect(sess.id)}
            >
              <span className={s.itemTitle}>
                {busy && <ThinkingDots />}
                {sess.title}
              </span>
              <span className={s.itemTrailing}>
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
        <OpptrixButton className={s.settingsBtn} variant="ghost" icon={<SettingsRegular />} onClick={onOpenSettings}>
          设置
        </OpptrixButton>
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
        width={opptrixTokens.sidebarWidth}
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
        !isDrawer && 'opptrix-sidebar-edge',
      )}
    >
      {sidebarBody}
    </aside>
  )

  if (isDrawer) {
    return (
      <>
        <div
          className={mergeClasses(s.backdrop, drawerOpen && s.backdropVisible)}
          onClick={onClose}
          aria-hidden="true"
        />
        {sidebarEl}
      </>
    )
  }

  return (
    <div className={mergeClasses(s.panelShell, visible && s.panelShellVisible)}>
      {sidebarEl}
    </div>
  )
}

export default memo(SessionSidebar)
