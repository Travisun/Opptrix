import {
  Text, makeStyles, mergeClasses,
} from '@fluentui/react-components'
import {
  SettingsRegular, DeleteRegular, DismissRegular,
} from '@fluentui/react-icons'
import { ChatAddRegular } from './chatIcons'
import type { SessionMeta } from '../types/chat'
import { innoTokens } from '../theme/tokens'
import { ghostInteractive, motion, nativeIconInteractive, sidebarItemSelected, sidebarTopMenuIcon, sidebarTopMenuRow, SIDEBAR_TOP_MENU_ICON_SIZE } from '../theme/mixins'
import InnoButton from '../components/inno/InnoButton'
import { isElectron } from '../platform/detect'
import { DESKTOP_SIDEBAR_LAYOUT_MS, DESKTOP_SIDEBAR_LAYOUT_EASE, DESKTOP_TITLEBAR_HEIGHT } from '../desktop/constants'
import OverlaySidebarShell from '../desktop/OverlaySidebarShell'

export type SidebarMode = 'panel' | 'drawer' | 'overlay'

const useStyles = makeStyles({
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: 'transparent',
    flexShrink: 0,
  },
  sidebarWeb: {
    backgroundColor: innoTokens.canvasAlt,
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
    width: innoTokens.sidebarWidth,
    pointerEvents: 'auto',
  },
  sidebarPanel: {
    width: innoTokens.sidebarWidth,
    minWidth: innoTokens.sidebarWidth,
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
    width: innoTokens.mobileDrawerWidth,
    maxWidth: '300px',
    zIndex: 200,
    paddingTop: 'env(safe-area-inset-top)',
    paddingBottom: 'env(safe-area-inset-bottom)',
    transform: 'translateX(-100%)',
    transitionProperty: 'transform',
    transitionDuration: motion.slow,
    transitionTimingFunction: motion.easeOut,
    backgroundColor: innoTokens.canvas,
    borderLeft: `1px solid ${innoTokens.separator}`,
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
  menuRow: {
    ...sidebarTopMenuRow,
    marginBottom: '6px',
  },
  menuIcon: sidebarTopMenuIcon,
  sectionLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: innoTokens.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    padding: '6px 14px 2px',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '5px 10px',
    minHeight: '30px',
    borderRadius: innoTokens.radiusMd,
    color: innoTokens.textPrimary,
    ...ghostInteractive,
    ':hover': {
      backgroundColor: innoTokens.surfaceHover,
    },
  },
  itemActive: {
    ...sidebarItemSelected,
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
    width: '40px',
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  itemDate: {
    fontSize: '11px',
    color: innoTokens.textTertiary,
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
  empty: {
    padding: '32px 16px',
    textAlign: 'center',
    fontSize: '13px',
    color: innoTokens.textTertiary,
    lineHeight: 1.6,
  },
  footer: {
    padding: '8px',
    marginTop: 'auto',
  },
  settingsBtn: {
    width: '100%',
    justifyContent: 'flex-start',
    color: innoTokens.textSecondary,
    fontWeight: 500,
    minHeight: '32px',
    paddingTop: '5px',
    paddingBottom: '5px',
    borderRadius: innoTokens.radiusMd,
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
    borderRadius: innoTokens.radiusMd,
    color: innoTokens.textTertiary,
  },
})

interface SessionSidebarProps {
  mode: SidebarMode
  visible?: boolean
  drawerOpen?: boolean
  sessions: SessionMeta[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onOpenSettings: () => void
  onClose?: () => void
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

export default function SessionSidebar({
  mode, visible = true, drawerOpen = false,
  sessions, activeId,
  onSelect, onNew, onDelete, onOpenSettings, onClose,
}: SessionSidebarProps) {
  const s = useStyles()
  const isDrawer = mode === 'drawer'
  const isOverlay = mode === 'overlay'
  const electronChrome = isElectron() && !isDrawer

  const handleSelect = (id: string) => {
    onSelect(id)
    if (isDrawer || isOverlay) onClose?.()
  }

  const sidebarBody = (
    <>
      {isDrawer && (
        <div className={s.drawerHead}>
          <InnoButton className={s.iconBtn} variant="ghost" icon={<DismissRegular />} onClick={onClose} aria-label="关闭" />
        </div>
      )}

      <button type="button" className={mergeClasses(s.menuRow, 'inno-focusable')} onClick={onNew}>
        <ChatAddRegular className={s.menuIcon} fontSize={SIDEBAR_TOP_MENU_ICON_SIZE} />
        <span>新对话</span>
      </button>

      <Text className={s.sectionLabel}>对话</Text>

      <div className={mergeClasses(s.list, 'inno-scroll', 'inno-scroll-hover')}>
        {sessions.length === 0 && (
          <div className={s.empty}>暂无历史对话</div>
        )}
        {sessions.map(sess => {
          const active = sess.id === activeId
          return (
            <div
              key={sess.id}
              className={mergeClasses(
                'inno-session-item',
                'inno-focusable',
                s.item,
                active && s.itemActive,
                active && 'inno-session-item-active',
              )}
              onClick={() => handleSelect(sess.id)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && handleSelect(sess.id)}
            >
              <span className={s.itemTitle}>{sess.title}</span>
              <span className={s.itemTrailing}>
                <span className={mergeClasses(s.itemDate, 'inno-session-date')}>{formatDate(sess.updatedAt)}</span>
                <button
                  type="button"
                  className={mergeClasses(s.itemDelete, 'inno-session-delete', 'inno-focusable')}
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

      <div className={s.footer}>
        <InnoButton className={s.settingsBtn} variant="ghost" icon={<SettingsRegular />} onClick={onOpenSettings}>
          设置
        </InnoButton>
      </div>
    </>
  )

  if (isOverlay) {
    return (
      <OverlaySidebarShell
        open={visible}
        width={innoTokens.sidebarWidth}
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
        electronChrome && s.sidebarTopElectron,
        electronChrome && 'inno-glass-sidebar',
        !isDrawer && 'inno-sidebar-edge',
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
