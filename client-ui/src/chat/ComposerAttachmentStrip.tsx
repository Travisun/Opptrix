import { useCallback, useEffect, useState, useRef } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  DocumentPdfRegular,
  MusicNote2Regular,
  VideoRegular,
  ImageRegular,
  DismissRegular,
} from '@fluentui/react-icons'
import type { ChatAttachmentMeta, MediaKind } from '../types/chat'
import { formatBytesShort } from './mediaCapabilities'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'

const useStyles = makeStyles({
  strip: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    padding: '0 2px 4px',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    maxWidth: '220px',
    padding: '6px 8px 6px 6px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.border}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
  },
  thumb: {
    width: '36px',
    height: '36px',
    borderRadius: opptrixTokens.radiusSm,
    objectFit: 'cover',
    flexShrink: 0,
    backgroundColor: opptrixCssVars.canvas,
  },
  iconBox: {
    width: '36px',
    height: '36px',
    borderRadius: opptrixTokens.radiusSm,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    backgroundColor: opptrixCssVars.canvas,
    color: opptrixCssVars.textTertiary,
  },
  meta: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  name: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-base)',
  },
  size: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
  },
  remove: {
    border: 'none',
    background: 'transparent',
    padding: 0,
    marginLeft: '2px',
    color: opptrixCssVars.textTertiary,
    cursor: 'pointer',
    display: 'inline-flex',
    ':hover': { color: opptrixCssVars.textSecondary },
  },
})

function kindIcon(kind: MediaKind) {
  switch (kind) {
    case 'pdf': return <DocumentPdfRegular fontSize={18} />
    case 'document': return <DocumentPdfRegular fontSize={18} />
    case 'video': return <VideoRegular fontSize={18} />
    case 'audio': return <MusicNote2Regular fontSize={18} />
    default: return <ImageRegular fontSize={18} />
  }
}

function attachmentStatusLabel(item: ChatAttachmentMeta): string {
  if (item.kind === 'pdf' || item.kind === 'document' || item.kind === 'image') {
    const status = item.extract?.status
    if (status === 'pending') {
      if (item.kind === 'image') return '正在识别文字…'
      const phase = item.extract?.phase
      if (phase === 'converting') return '正在转换文档…'
      if (phase === 'ocr') {
        const done = item.extract?.ocrDone
        const total = item.extract?.ocrTotal
        if (typeof done === 'number' && typeof total === 'number' && total > 0) {
          return `正在识别图片文字（${done}/${total}）…`
        }
        return '正在识别图片文字…'
      }
      const msg = item.extract?.message?.trim()
      if (msg) return msg
      return '正在整理…'
    }
    if (status === 'ready') {
      const pages = item.extract?.pageCount
      return pages != null ? `已整理，共 ${pages} 页` : '已整理'
    }
    if (status === 'failed') return item.extract?.error || '整理失败，请换可读文件后重试'
  }
  return formatBytesShort(item.size)
}

interface Props {
  items: ChatAttachmentMeta[]
  sessionId?: string | null
  onRemove?: (id: string) => void
  getUrl?: (attachmentId: string) => string
  className?: string
}

export default function ComposerAttachmentStrip({
  items,
  sessionId,
  onRemove,
  getUrl,
  className,
}: Props) {
  const s = useStyles()
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})
  const urlsRef = useRef<string[]>([])

  const resolveUrl = useCallback((id: string) => {
    if (getUrl) return getUrl(id)
    if (!sessionId) return ''
    return `/api/sessions/${sessionId}/attachments/${id}`
  }, [getUrl, sessionId])

  useEffect(() => {
    const created: string[] = []
    const next: Record<string, string> = {}
    for (const item of items) {
      if (item.kind !== 'image') continue
      const url = resolveUrl(item.id)
      if (!url) continue
      next[item.id] = url
    }
    setThumbUrls(next)
    urlsRef.current = created
    return () => {
      for (const u of urlsRef.current) URL.revokeObjectURL(u)
    }
  }, [items, resolveUrl])

  if (!items.length) return null

  return (
    <div className={mergeClasses(s.strip, className)}>
      {items.map(item => (
        <div key={item.id} className={s.chip}>
          {item.kind === 'image' && thumbUrls[item.id] ? (
            <img src={thumbUrls[item.id]} alt="" className={s.thumb} />
          ) : (
            <span className={s.iconBox}>{kindIcon(item.kind)}</span>
          )}
          <span className={s.meta}>
            <span className={s.name} title={item.name}>{item.name}</span>
            <span className={s.size}>{attachmentStatusLabel(item)}</span>
          </span>
          {onRemove ? (
            <button
              type="button"
              className={s.remove}
              aria-label={`移除 ${item.name}`}
              onClick={() => onRemove(item.id)}
            >
              <DismissRegular fontSize={14} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export function MessageAttachmentStrip({
  items,
  onOpen,
}: {
  items: ChatAttachmentMeta[]
  onOpen: (item: ChatAttachmentMeta) => void
}) {
  const s = useStyles()
  if (!items.length) return null
  return (
    <div className={s.strip}>
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          className={s.chip}
          onClick={() => onOpen(item)}
          aria-label={`查看 ${item.name}`}
        >
          <span className={s.iconBox}>{kindIcon(item.kind)}</span>
          <span className={s.meta}>
            <span className={s.name}>{item.name}</span>
            <span className={s.size}>{attachmentStatusLabel(item)}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
