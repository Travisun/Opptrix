import {
  Text, makeStyles, mergeClasses,
} from '@fluentui/react-components'
import {
  AddRegular, SettingsRegular, DeleteRegular, ChatRegular, DismissRegular,
} from '@fluentui/react-icons'
import type { SessionMeta } from '../types/chat'
import { innoTokens } from '../theme/tokens'
import { motion } from '../theme/mixins'
import InnoButton from '../components/inno/InnoButton'

export type SidebarMode = 'panel' | 'drawer'

const useStyles = makeStyles({
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: innoTokens.surface,
    flexShrink: 0,
  },
  panelShell: {
    flexShrink: 0,
    width: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    transitionProperty: 'width',
    transitionDuration: motion.normal,
    transitionTimingFunction: motion.easeOut,
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
    transform: 'translateX(-20px)',
    transitionProperty: 'opacity, transform',
    transitionDuration: motion.normal,
    transitionTimingFunction: motion.easeOut,
    willChange: 'opacity, transform',
  },
  sidebarPanelVisible: {
    opacity: 1,
    transform: 'translateX(0)',
    borderRight: `1px solid ${innoTokens.separator}`,
  },
  sidebarDrawer: {
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    width: innoTokens.mobileDrawerWidth,
    maxWidth: '300px',
    zIndex: 200,
    borderRight: `1px solid ${innoTokens.separator}`,
    paddingTop: 'env(safe-area-inset-top)',
    paddingBottom: 'env(safe-area-inset-bottom)',
    transform: 'translateX(-100%)',
    transitionProperty: 'transform',
    transitionDuration: motion.slow,
    transitionTimingFunction: motion.easeOut,
    willChange: 'transform',
  },
  sidebarDrawerOpen: {
    transform: 'translateX(0)',
  },
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    zIndex: 150,
    opacity: 0,
    pointerEvents: 'none',
    transitionProperty: 'opacity',
    transitionDuration: motion.slow,
    transitionTimingFunction: motion.easeOut,
  },
  backdropVisible: {
    opacity: 1,
    pointerEvents: 'auto',
  },
  brand: {
    padding: '20px 16px 12px',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '8px',
  },
  brandTitle: {
    fontSize: '16px',
    fontWeight: 650,
    color: innoTokens.textPrimary,
  },
  brandSub: {
    fontSize: '12px',
    color: innoTokens.textTertiary,
    marginTop: '4px',
  },
  iconBtn: {
    minWidth: '40px',
    height: '40px',
    borderRadius: innoTokens.radiusSm,
    color: innoTokens.textTertiary,
  },
  newBtnWrap: {
    padding: '0 12px 8px',
  },
  newBtn: {
    width: '100%',
    borderRadius: innoTokens.radiusMd,
    fontWeight: 600,
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
    gap: '10px',
    padding: '12px',
    minHeight: '48px',
    borderRadius: innoTokens.radiusMd,
    cursor: 'pointer',
    backgroundColor: 'transparent',
    WebkitTapHighlightColor: 'transparent',
    '@media (hover: hover)': {
      ':hover': {
        backgroundColor: innoTokens.surfaceMuted,
      },
    },
    ':active': {
      backgroundColor: innoTokens.surfaceMuted,
    },
  },
  itemActive: {
    backgroundColor: innoTokens.accentSoft,
  },
  itemIcon: {
    color: innoTokens.textTertiary,
    flexShrink: 0,
  },
  itemIconActive: {
    color: innoTokens.accent,
  },
  itemTitle: {
    flex: 1,
    fontSize: '14px',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: innoTokens.textPrimary,
  },
  itemTime: {
    fontSize: '11px',
    color: innoTokens.textTertiary,
    flexShrink: 0,
  },
  deleteBtn: {
    opacity: 0.45,
    minWidth: '40px',
    height: '40px',
    '@media (hover: hover)': {
      opacity: 0,
      ':hover': { opacity: 1 },
    },
  },
  itemWithDelete: {
    '@media (hover: hover)': {
      ':hover $deleteBtn': { opacity: 0.55 },
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
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '0 4px',
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: innoTokens.radiusFull,
    flexShrink: 0,
  },
  statusOk: { backgroundColor: innoTokens.success },
  statusErr: { backgroundColor: innoTokens.error },
  statusText: {
    fontSize: '12px',
    color: innoTokens.textSecondary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  settingsBtn: {
    width: '100%',
    justifyContent: 'flex-start',
    color: innoTokens.textSecondary,
    fontWeight: 500,
    minHeight: '44px',
  },
})

interface SessionSidebarProps {
  mode: SidebarMode
  /** Desktop panel: animate show/hide */
  visible?: boolean
  drawerOpen?: boolean
  sessions: SessionMeta[]
  activeId: string | null
  llmLabel: string
  backendOk: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onOpenSettings: () => void
  onClose?: () => void
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

export default function SessionSidebar({
  mode, visible = true, drawerOpen = false,
  sessions, activeId, llmLabel, backendOk,
  onSelect, onNew, onDelete, onOpenSettings, onClose,
}: SessionSidebarProps) {
  const s = useStyles()
  const isDrawer = mode === 'drawer'

  const handleSelect = (id: string) => {
    onSelect(id)
    if (isDrawer) onClose?.()
  }

  const sidebarEl = (
    <aside
      className={mergeClasses(
        s.sidebar,
        isDrawer ? s.sidebarDrawer : s.sidebarPanel,
        !isDrawer && visible && s.sidebarPanelVisible,
        isDrawer && drawerOpen && s.sidebarDrawerOpen,
      )}
    >
      <div className={s.brand}>
        <div>
          <div className={s.brandTitle}>innoAStock</div>
          <div className={s.brandSub}>投研 Chat Agent</div>
        </div>
        {isDrawer && (
          <InnoButton className={s.iconBtn} variant="ghost" icon={<DismissRegular />} onClick={onClose} aria-label="关闭" />
        )}
      </div>

      <div className={s.newBtnWrap}>
        <InnoButton className={s.newBtn} variant="primary" icon={<AddRegular />} onClick={onNew}>
          新对话
        </InnoButton>
      </div>

      <div className={`${s.list} inno-scroll`}>
        {sessions.length === 0 && (
          <div className={s.empty}>暂无历史对话</div>
        )}
        {sessions.map(sess => {
          const active = sess.id === activeId
          return (
            <div
              key={sess.id}
              className={mergeClasses(s.item, s.itemWithDelete, active && s.itemActive)}
              onClick={() => handleSelect(sess.id)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && handleSelect(sess.id)}
            >
              <ChatRegular className={mergeClasses(s.itemIcon, active && s.itemIconActive)} fontSize={16} />
              <span className={s.itemTitle}>{sess.title}</span>
              <span className={s.itemTime}>{formatTime(sess.updatedAt)}</span>
              <InnoButton
                className={s.deleteBtn}
                variant="icon"
                icon={<DeleteRegular fontSize={14} />}
                onClick={e => { e.stopPropagation(); onDelete(sess.id) }}
                aria-label="删除对话"
              />
            </div>
          )
        })}
      </div>

      <div className={s.footer}>
        <div className={s.statusRow}>
          <span className={mergeClasses(s.statusDot, backendOk ? s.statusOk : s.statusErr)} />
          <Text className={s.statusText}>{llmLabel}</Text>
        </div>
        <InnoButton className={s.settingsBtn} variant="ghost" icon={<SettingsRegular />} onClick={onOpenSettings}>
          设置
        </InnoButton>
      </div>
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
