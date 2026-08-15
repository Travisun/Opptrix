import { useCallback, useEffect, useRef, useState } from 'react'
import { makeStyles, mergeClasses, Spinner, Text } from '@fluentui/react-components'
import { DocumentBulletListRegular } from '@fluentui/react-icons'
import type { ChatAttachmentMeta, MediaKind, SessionAttachmentListItem } from '../types/chat'
import { listSessionAttachments } from '../api/client'
import { attachmentKindIcon } from './attachmentKindIcon'
import { formatBytesShort } from './mediaCapabilities'
import FilenameEllipsis from './FilenameEllipsis'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'

const KIND_LABEL: Record<MediaKind, string> = {
  text: '文本',
  image: '图片',
  pdf: 'PDF',
  document: '文档',
  video: '视频',
  audio: '音频',
  canvas: '画布',
  mindmap: '脑图',
  web: '网页',
}

const useStyles = makeStyles({
  root: {
    flex: '0 0 220px',
    width: '220px',
    minWidth: '200px',
    maxWidth: '240px',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    borderRight: `1px solid ${opptrixCssVars.separator}`,
    boxSizing: 'border-box',
  },
  /** Fill center preview pane when no file is selected. */
  rootPicker: {
    flex: '1 1 auto',
    width: '100%',
    minWidth: 0,
    maxWidth: 'none',
    borderRight: 'none',
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '8px 6px',
    boxSizing: 'border-box',
  },
  scrollPicker: {
    width: '100%',
    maxWidth: '420px',
    margin: '0 auto',
    padding: '16px 12px',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    padding: '28px 0',
  },
  loadingPicker: {
    padding: '48px 0',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    padding: '24px 10px',
    textAlign: 'center',
  },
  emptyPicker: {
    padding: '48px 16px',
  },
  emptyIcon: {
    display: 'inline-flex',
    color: opptrixCssVars.textTertiary,
    marginBottom: '2px',
  },
  emptyTitle: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textPrimary,
    fontWeight: 500,
  },
  emptyHint: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
  },
  error: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '20px 10px',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.45,
  },
  retry: {
    border: 'none',
    background: 'transparent',
    padding: '4px 8px',
    cursor: 'pointer',
    color: opptrixCssVars.accent,
    fontSize: 'var(--opptrix-font-sm)',
    borderRadius: opptrixTokens.radiusSm,
    ':hover': {
      backgroundColor: opptrixCssVars.canvasAlt,
    },
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '8px 8px',
    boxSizing: 'border-box',
    border: 'none',
    borderRadius: opptrixTokens.radiusMd,
    background: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
    color: opptrixCssVars.textPrimary,
    ':hover': {
      backgroundColor: opptrixCssVars.canvasAlt,
    },
  },
  rowSelected: {
    backgroundColor: opptrixCssVars.canvasAlt,
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
  },
  rowMeta: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
})

export type FilePreviewFileListVariant = 'sidebar' | 'picker'

interface Props {
  sessionId: string
  panelVisible: boolean
  selectedId?: string | null
  onSelectAttachment?: (attachment: ChatAttachmentMeta) => void
  /** 列表条数变化时通知 */
  onItemCountChange?: (count: number) => void
  /** `sidebar`：左侧窄栏；`picker`：占满中间预览区供点选 */
  variant?: FilePreviewFileListVariant
}

export default function FilePreviewFileList({
  sessionId,
  panelVisible,
  selectedId = null,
  onSelectAttachment,
  onItemCountChange,
  variant = 'sidebar',
}: Props) {
  const s = useStyles()
  const isPicker = variant === 'picker'
  const [items, setItems] = useState<SessionAttachmentListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const onItemCountChangeRef = useRef(onItemCountChange)
  onItemCountChangeRef.current = onItemCountChange
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  const refresh = useCallback(async (sid: string) => {
    setLoading(true)
    setError(false)
    setItems([])
    onItemCountChangeRef.current?.(0)
    try {
      const next = await listSessionAttachments(sid)
      if (sessionIdRef.current !== sid) return
      setItems(next)
      onItemCountChangeRef.current?.(next.length)
    } catch {
      if (sessionIdRef.current !== sid) return
      setItems([])
      setError(true)
      onItemCountChangeRef.current?.(0)
    } finally {
      if (sessionIdRef.current === sid) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!panelVisible || !sessionId) {
      setItems([])
      setError(false)
      setLoading(false)
      onItemCountChangeRef.current?.(0)
      return
    }
    setItems([])
    setError(false)
    setLoading(true)
    onItemCountChangeRef.current?.(0)
    void refresh(sessionId)
  }, [panelVisible, sessionId, refresh])

  return (
    <aside
      className={mergeClasses(s.root, isPicker && s.rootPicker)}
      aria-label="本对话文件"
    >
      <div
        className={mergeClasses(
          s.scroll,
          isPicker && s.scrollPicker,
          'opptrix-scroll',
          'opptrix-scroll-hover',
        )}
      >
        {loading ? (
          <div className={mergeClasses(s.loading, isPicker && s.loadingPicker)}>
            <Spinner size="tiny" label="正在加载…" />
          </div>
        ) : null}

        {!loading && error ? (
          <div className={s.error} role="alert">
            <Text className={s.errorText} block>
              暂时无法加载文件列表
            </Text>
            <button
              type="button"
              className={s.retry}
              onClick={() => { void refresh(sessionId) }}
            >
              稍后重试
            </button>
          </div>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <div className={mergeClasses(s.empty, isPicker && s.emptyPicker)} role="status">
            <span className={s.emptyIcon} aria-hidden>
              <DocumentBulletListRegular fontSize={22} />
            </span>
            <Text className={s.emptyTitle} block>还没有文件</Text>
            <Text className={s.emptyHint} block>
              在对话中上传或生成报告后，会出现在这里
            </Text>
          </div>
        ) : null}

        {!loading && items.length > 0 ? (
          <div className={s.list} role="list">
            {items.map(item => {
              const kind = KIND_LABEL[item.kind] ?? '文件'
              const metaLine = [kind, formatBytesShort(item.size)].filter(Boolean).join(' · ')
              const selected = selectedId === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  role="listitem"
                  className={mergeClasses(s.row, selected && s.rowSelected)}
                  aria-current={selected ? 'true' : undefined}
                  title={`预览 ${item.name}`}
                  onClick={() => onSelectAttachment?.(item)}
                >
                  <span className={s.rowIcon}>
                    {attachmentKindIcon(item.kind, item.name, 18)}
                  </span>
                  <span className={s.rowMain}>
                    <FilenameEllipsis name={item.name} className={s.rowName} />
                    <span className={s.rowMeta}>{metaLine}</span>
                  </span>
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    </aside>
  )
}
