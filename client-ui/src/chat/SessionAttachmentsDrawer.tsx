import { useCallback, useEffect, useRef, useState } from 'react'
import { makeStyles, mergeClasses, Spinner, Text } from '@fluentui/react-components'
import { DeleteRegular } from '@fluentui/react-icons'
import type { ChatAttachmentMeta, MediaKind, SessionAttachmentListItem } from '../types/chat'
import { deleteSessionAttachment, listSessionAttachments } from '../api/client'
import { attachmentKindIcon } from './attachmentKindIcon'
import { formatBytesShort } from './mediaCapabilities'
import { formatFriendlyTime } from '../utils/formatFriendlyTime'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { ghostInteractive, motion } from '../theme/mixins'

const DRAWER_MOTION_MS = 240

const KIND_LABEL: Record<MediaKind, string> = {
  text: '文本',
  image: '图片',
  pdf: 'PDF',
  document: '文档',
  video: '视频',
  audio: '音频',
  canvas: '画布',
  mindmap: '脑图',
}

const useStyles = makeStyles({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
    width: 'min(300px, 88%)',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    backgroundColor: opptrixCssVars.canvas,
    borderLeft: `1px solid ${opptrixCssVars.separator}`,
    /* 偏黑投影：亮/暗均靠黑透明度，避免 textPrimary color-mix 在暗色下发白光晕 */
    boxShadow: '-12px 0 28px rgba(0, 0, 0, 0.14), -2px 0 8px rgba(0, 0, 0, 0.06)',
    transform: 'translate3d(104%, 0, 0)',
    opacity: 0,
    pointerEvents: 'none',
    transitionProperty: 'transform, opacity',
    transitionDuration: `${DRAWER_MOTION_MS}ms`,
    transitionTimingFunction: motion.easeOutStrong,
    willChange: 'transform, opacity',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '1ms',
      transform: 'none',
    },
  },
  open: {
    transform: 'translate3d(0, 0, 0)',
    opacity: 1,
    pointerEvents: 'auto',
    '@media (prefers-reduced-motion: reduce)': {
      opacity: 1,
    },
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '12px 8px 0',
    boxSizing: 'border-box',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    '::-webkit-scrollbar': {
      display: 'none',
      width: 0,
      height: 0,
    },
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    padding: '28px 0',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '28px 12px',
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textPrimary,
    fontWeight: 500,
  },
  emptyHint: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
  },
  error: {
    padding: '12px',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.error,
    lineHeight: 1.45,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    width: '100%',
    padding: '4px 4px 4px 8px',
    boxSizing: 'border-box',
    borderRadius: opptrixTokens.radiusMd,
    color: opptrixCssVars.textPrimary,
    ':hover': {
      backgroundColor: opptrixCssVars.canvasAlt,
    },
  },
  rowOpen: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: '1 1 auto',
    minWidth: 0,
    padding: '4px 0',
    border: 'none',
    background: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
    color: 'inherit',
  },
  rowIcon: {
    flexShrink: 0,
    display: 'inline-flex',
    color: opptrixCssVars.textSecondary,
  },
  rowMain: {
    flex: '1 1 auto',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  rowName: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowMeta: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  deleteBtn: {
    ...ghostInteractive,
    flexShrink: 0,
    width: '26px',
    height: '26px',
    minWidth: '26px',
    minHeight: '26px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    color: opptrixCssVars.textTertiary,
    ':hover:not(:disabled)': {
      color: opptrixCssVars.error,
    },
    ':disabled': {
      opacity: 0.4,
      cursor: 'not-allowed',
    },
  },
})

interface Props {
  open: boolean
  sessionId: string | null
  composerPadBottom: number
  onClose: () => void
  onOpen: (sessionId: string, attachment: ChatAttachmentMeta) => void
}

export default function SessionAttachmentsDrawer({
  open,
  sessionId,
  composerPadBottom,
  onClose,
  onOpen,
}: Props) {
  const s = useStyles()
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const [items, setItems] = useState<SessionAttachmentListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const openRafRef = useRef<number | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)

  const refresh = useCallback(async (sid: string) => {
    setLoading(true)
    setError('')
    try {
      setItems(await listSessionAttachments(sid))
    } catch (e) {
      setItems([])
      setError(e instanceof Error ? e.message : '暂时无法加载附件列表')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const clearTimers = () => {
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
      if (openRafRef.current != null) {
        window.cancelAnimationFrame(openRafRef.current)
        openRafRef.current = null
      }
    }

    if (open) {
      clearTimers()
      setMounted(true)
      openRafRef.current = requestAnimationFrame(() => {
        openRafRef.current = requestAnimationFrame(() => {
          openRafRef.current = null
          setVisible(true)
        })
      })
      return clearTimers
    }

    setVisible(false)
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null
      setMounted(false)
    }, DRAWER_MOTION_MS)
    return clearTimers
  }, [open])

  useEffect(() => {
    if (!open || !sessionId) return
    void refresh(sessionId)
  }, [open, sessionId, refresh])

  useEffect(() => {
    if (!mounted || !visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mounted, visible, onClose])

  // Outside click：关抽屉；排除抽屉内部与文件箱 toggle（避免先关再 toggle 又开）
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-attachments-toggle]')) return
      const panel = panelRef.current
      if (panel && panel.contains(target)) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, onClose])

  const handleDelete = async (item: SessionAttachmentListItem) => {
    if (!sessionId || item.referenced || deletingId) return
    setDeletingId(item.id)
    setError('')
    try {
      await deleteSessionAttachment(sessionId, item.id)
      await refresh(sessionId)
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败，请稍后重试')
    } finally {
      setDeletingId(null)
    }
  }

  if (!mounted || !sessionId) return null

  return (
    <aside
      ref={panelRef}
      id="session-attachments-drawer"
      className={mergeClasses(s.root, visible && s.open)}
      role="dialog"
      aria-modal="false"
      aria-label="本对话附件"
      aria-hidden={!visible}
    >
      <div
        className={mergeClasses(s.body, 'opptrix-scroll-hidden')}
        style={{ paddingBottom: `${Math.max(composerPadBottom, 16)}px` }}
      >
        {loading ? (
          <div className={s.loading}>
            <Spinner size="tiny" label="正在加载附件…" />
          </div>
        ) : null}
        {!loading && error ? (
          <Text className={s.error} block>
            {error}
            {' '}请稍后重试
          </Text>
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <div className={s.empty}>
            <Text className={s.emptyTitle} block>还没有附件</Text>
            <Text className={s.emptyHint} block>
              在输入区添加文件后，可在这里查看与管理
            </Text>
          </div>
        ) : null}
        {!loading && items.length > 0 ? (
          <div className={s.list}>
            {items.map(item => {
              const kind = KIND_LABEL[item.kind] ?? '文件'
              const metaLine = [
                kind,
                formatBytesShort(item.size),
                formatFriendlyTime(item.createdAt),
              ].filter(Boolean).join(' · ')
              const deleteTitle = item.referenced ? '已在对话中使用' : '删除附件'
              return (
                <div key={item.id} className={s.row}>
                  <button
                    type="button"
                    className={s.rowOpen}
                    onClick={() => onOpen(sessionId, item)}
                    title={`预览 ${item.name}`}
                  >
                    <span className={s.rowIcon}>
                      {attachmentKindIcon(item.kind, item.name, 18)}
                    </span>
                    <span className={s.rowMain}>
                      <span className={s.rowName}>{item.name}</span>
                      <span className={s.rowMeta}>{metaLine}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={s.deleteBtn}
                    disabled={item.referenced || deletingId === item.id}
                    title={deleteTitle}
                    aria-label={deleteTitle}
                    onClick={() => { void handleDelete(item) }}
                  >
                    <DeleteRegular fontSize={14} />
                  </button>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </aside>
  )
}
