import { useCallback, useEffect, useState, useRef } from 'react'
import { makeStyles, mergeClasses, Spinner } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import type { ChatAttachmentMeta } from '../types/chat'
import { attachmentKindIcon } from './attachmentKindIcon'
import CanvasInlineCard from './CanvasInlineCard'
import MindmapInlineCard from './MindmapInlineCard'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'

const CHIP_WIDTH = 168
const NAME_MAX_CHARS = 16

const useStyles = makeStyles({
  strip: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    padding: '0 2px 4px',
  },
  stripBlock: {
    width: '100%',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    width: 'fit-content',
    maxWidth: `${CHIP_WIDTH}px`,
    boxSizing: 'border-box',
    padding: '3px 5px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.border}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
  },
  thumb: {
    width: '26px',
    height: '26px',
    borderRadius: opptrixTokens.radiusSm,
    objectFit: 'cover',
    flexShrink: 0,
    backgroundColor: opptrixCssVars.canvas,
  },
  iconBox: {
    width: '18px',
    height: '18px',
    borderRadius: opptrixTokens.radiusSm,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: opptrixCssVars.textTertiary,
  },
  /** processing：无底色方块，尺寸贴合文字行高 */
  spinnerSlot: {
    width: '16px',
    height: '16px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    // Fluent Spinner：color = 旋转弧，backgroundColor = 轨道
    '& .fui-Spinner__spinner': {
      width: '12px',
      height: '12px',
      color: opptrixCssVars.textPrimary,
      backgroundColor: opptrixCssVars.separator,
    },
  },
  name: {
    flex: '0 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: '18px',
  },
  remove: {
    border: 'none',
    background: 'transparent',
    padding: 0,
    marginLeft: '0',
    color: opptrixCssVars.textTertiary,
    cursor: 'pointer',
    display: 'inline-flex',
    flexShrink: 0,
    ':hover': { color: opptrixCssVars.textSecondary },
  },
})

/** 中间省略文件名，尽量保留扩展名 */
export function middleEllipsisFilename(name: string, maxChars = NAME_MAX_CHARS): string {
  if (name.length <= maxChars) return name
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 && name.length - dot <= 8 ? name.slice(dot) : ''
  const base = ext ? name.slice(0, dot) : name
  const budget = maxChars - ext.length - 1
  if (budget < 4) {
    return `${name.slice(0, Math.max(1, maxChars - 1))}…`
  }
  const head = Math.ceil(budget / 2)
  const tail = Math.floor(budget / 2)
  return `${base.slice(0, head)}…${base.slice(-tail)}${ext}`
}

function isAttachmentProcessing(item: ChatAttachmentMeta): boolean {
  if (item.optimistic || item.id.startsWith('local-')) return true
  if (
    item.kind === 'pdf'
    || item.kind === 'document'
    || item.kind === 'image'
    || item.kind === 'audio'
    || item.kind === 'video'
  ) {
    return (item.extract?.status ?? 'pending') === 'pending'
  }
  return false
}

function attachmentTitle(item: ChatAttachmentMeta): string {
  if (item.extract?.status === 'failed') {
    const reason = item.extract.error?.trim() || '整理失败，请换可读文件后重试'
    return `${item.name}（${reason}）`
  }
  return item.name
}

function AttachmentIcon({
  item,
  thumbUrl,
  iconBoxClass,
  spinnerSlotClass,
  thumbClass,
}: {
  item: ChatAttachmentMeta
  thumbUrl?: string
  iconBoxClass: string
  spinnerSlotClass: string
  thumbClass: string
}) {
  if (isAttachmentProcessing(item)) {
    return (
      <span className={spinnerSlotClass} aria-label="正在处理">
        <Spinner size="tiny" />
      </span>
    )
  }
  if (item.kind === 'image' && thumbUrl) {
    return <img src={thumbUrl} alt="" className={thumbClass} />
  }
  return (
    <span className={iconBoxClass}>
      {attachmentKindIcon(item.kind, item.name, 14)}
    </span>
  )
}

interface Props {
  items: ChatAttachmentMeta[]
  sessionId?: string | null
  onRemove?: (id: string) => void
  getUrl?: (attachmentId: string) => string
  onPreview?: (item: ChatAttachmentMeta) => void
  className?: string
}

export default function ComposerAttachmentStrip({
  items,
  sessionId,
  onRemove,
  getUrl,
  onPreview,
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
      if (item.optimistic || item.id.startsWith('local-')) continue
      if (isAttachmentProcessing(item)) continue
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
        <div
          key={item.id}
          className={s.chip}
          {...(onPreview && !item.optimistic && !item.id.startsWith('local-') ? {
            role: 'button',
            tabIndex: 0,
            title: attachmentTitle(item),
            style: { cursor: 'pointer' },
            onClick: () => onPreview(item),
            onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onPreview(item)
              }
            },
          } : {
            title: attachmentTitle(item),
          })}
        >
          <AttachmentIcon
            item={item}
            thumbUrl={thumbUrls[item.id]}
            iconBoxClass={s.iconBox}
            spinnerSlotClass={s.spinnerSlot}
            thumbClass={s.thumb}
          />
          <span className={s.name} title={attachmentTitle(item)}>
            {middleEllipsisFilename(item.name)}
          </span>
          {onRemove ? (
            <button
              type="button"
              className={s.remove}
              aria-label={`移除 ${item.name}`}
              onClick={(e) => {
                e.stopPropagation()
                onRemove(item.id)
              }}
            >
              <DismissRegular fontSize={12} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export function MessageAttachmentStrip({
  items,
  sessionId,
  onOpen,
}: {
  items: ChatAttachmentMeta[]
  sessionId?: string | null
  onOpen: (item: ChatAttachmentMeta) => void
}) {
  const s = useStyles()
  if (!items.length) return null
  return (
    <div className={mergeClasses(s.strip, s.stripBlock)}>
      {items.map(item => {
        if (item.kind === 'mindmap' && sessionId) {
          return (
            <MindmapInlineCard
              key={item.id}
              sessionId={sessionId}
              attachment={item}
              onOpen={() => onOpen(item)}
            />
          )
        }
        if (item.kind === 'canvas' && sessionId) {
          return (
            <CanvasInlineCard
              key={item.id}
              sessionId={sessionId}
              attachment={item}
              onOpen={() => onOpen(item)}
            />
          )
        }
        return (
          <button
            key={item.id}
            type="button"
            className={s.chip}
            onClick={() => onOpen(item)}
            title={attachmentTitle(item)}
            aria-label={`查看 ${item.name}`}
          >
            <AttachmentIcon
              item={item}
              iconBoxClass={s.iconBox}
              spinnerSlotClass={s.spinnerSlot}
              thumbClass={s.thumb}
            />
            <span className={s.name}>{middleEllipsisFilename(item.name)}</span>
          </button>
        )
      })}
    </div>
  )
}
