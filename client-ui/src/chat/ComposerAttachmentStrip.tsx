import { useCallback, useEffect, useState, useRef, type MouseEvent } from 'react'
import { makeStyles, mergeClasses, Spinner } from '@fluentui/react-components'
import { DismissRegular, OpenRegular } from '@fluentui/react-icons'
import type { ChatAttachmentMeta } from '../types/chat'
import { attachmentKindIcon, attachmentKindLabel } from './attachmentKindIcon'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'

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
  /** 消息附件：芯片条与产物卡纵向分离 */
  messageAttachRoot: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
  },
  /** 消息内大量附件：约 3 行芯片高度，超出可滚（不含 canvas/mindmap） */
  stripMessageScroll: {
    maxHeight: '112px',
    overflowY: 'auto',
  },
  artifactStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
    marginBottom: '5px',
  },
  /** 生成物矮行：约 2 行文字高，全宽；左大图标区分种类 */
  artifactRow: {
    ...ghostInteractive,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    height: '44px',
    minHeight: '44px',
    maxHeight: '44px',
    boxSizing: 'border-box',
    margin: 0,
    padding: '0 12px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.border}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    textAlign: 'left',
    color: opptrixCssVars.textPrimary,
    font: 'inherit',
    fontFamily: 'inherit',
    cursor: 'pointer',
    transitionProperty: 'border-color, background-color',
    transitionDuration: '0.15s',
    transitionTimingFunction: 'ease',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      border: `1px solid ${opptrixCssVars.borderStrong}`,
    },
    ':active': {
      opacity: 1,
      backgroundColor: opptrixCssVars.canvasMuted,
    },
    ':focus': { outline: 'none' },
    ':focus-visible': {
      outline: `${opptrixTokens.focusRingWidth} solid ${opptrixCssVars.inputBorderFocus}`,
      outlineOffset: opptrixTokens.focusRingOffset,
    },
  },
  artifactIconWell: {
    width: '28px',
    height: '28px',
    borderRadius: opptrixTokens.radiusSm,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: opptrixCssVars.textSecondary,
    backgroundColor: opptrixCssVars.surface,
  },
  artifactMeta: {
    flex: '1 1 auto',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '1px',
  },
  artifactName: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    lineHeight: '18px',
    color: opptrixCssVars.textPrimary,
  },
  artifactKind: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: '16px',
    color: opptrixCssVars.textTertiary,
  },
  artifactOpenIcon: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    color: opptrixCssVars.textTertiary,
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
  /** 可点击附件芯片：hover/active 用背景与边框，避免整卡 opacity */
  chipInteractive: {
    cursor: 'pointer',
    margin: 0,
    font: 'inherit',
    fontFamily: 'inherit',
    transitionProperty: 'background-color, border-color',
    transitionDuration: '0.15s',
    transitionTimingFunction: 'ease',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      border: `1px solid ${opptrixCssVars.borderStrong}`,
    },
    ':active': {
      backgroundColor: opptrixCssVars.canvasMuted,
      border: `1px solid ${opptrixCssVars.borderStrong}`,
    },
    ':focus': { outline: 'none' },
    ':focus-visible': {
      outline: `${opptrixTokens.focusRingWidth} solid ${opptrixCssVars.inputBorderFocus}`,
      outlineOffset: opptrixTokens.focusRingOffset,
    },
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

function isAttachmentUploading(item: ChatAttachmentMeta): boolean {
  return Boolean(item.optimistic || item.id.startsWith('local-'))
}

function isAttachmentProcessing(item: ChatAttachmentMeta): boolean {
  if (isAttachmentUploading(item)) return true
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
  if (isAttachmentUploading(item)) {
    const pct = item.uploadProgress
    if (typeof pct === 'number' && pct > 0 && pct < 1) {
      return `${item.name}（正在添加 ${Math.round(pct * 100)}%）`
    }
    return `${item.name}（正在添加…）`
  }
  if (item.extract?.status === 'failed') {
    const reason = item.extract.error?.trim() || '整理失败，请换可读文件后重试'
    return `${item.name}（${reason}）`
  }
  if ((item.extract?.status ?? '') === 'pending' && item.extract?.message?.trim()) {
    return `${item.name}（${item.extract.message.trim()}）`
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
      <span
        className={spinnerSlotClass}
        aria-label={isAttachmentUploading(item) ? '正在添加' : '正在处理'}
      >
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
      {items.map(item => {
        const previewable = Boolean(
          onPreview && !item.optimistic && !item.id.startsWith('local-'),
        )
        return (
        <div
          key={item.id}
          className={mergeClasses(s.chip, previewable && s.chipInteractive)}
          {...(previewable && onPreview ? {
            role: 'button',
            tabIndex: 0,
            title: attachmentTitle(item),
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
              aria-label={
                isAttachmentUploading(item)
                  ? `取消添加 ${item.name}`
                  : `移除 ${item.name}`
              }
              onClick={(e) => {
                e.stopPropagation()
                onRemove(item.id)
              }}
            >
              <DismissRegular fontSize={12} />
            </button>
          ) : null}
        </div>
        )
      })}
    </div>
  )
}

function ArtifactOpenRow({
  item,
  onOpen,
  rowClass,
  iconWellClass,
  metaClass,
  nameClass,
  kindClass,
  openIconClass,
}: {
  item: ChatAttachmentMeta
  onOpen: () => void
  rowClass: string
  iconWellClass: string
  metaClass: string
  nameClass: string
  kindClass: string
  openIconClass: string
}) {
  const kindLabel = attachmentKindLabel(item.kind)
  const openLabel = `打开${kindLabel} ${item.name}`
  return (
    <button
      type="button"
      className={rowClass}
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
      title={openLabel}
      aria-label={openLabel}
    >
      <span className={iconWellClass} aria-hidden>
        {attachmentKindIcon(item.kind, item.name, 24)}
      </span>
      <span className={metaClass}>
        <span className={nameClass} title={item.name}>
          {item.name}
        </span>
        <span className={kindClass}>{kindLabel}</span>
      </span>
      <span className={openIconClass} aria-hidden>
        <OpenRegular fontSize={18} />
      </span>
    </button>
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
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})

  const resolveUrl = useCallback((id: string) => {
    if (!sessionId) return ''
    return `/api/sessions/${sessionId}/attachments/${id}`
  }, [sessionId])

  useEffect(() => {
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
  }, [items, resolveUrl])

  if (!items.length) return null

  const isArtifact = (item: ChatAttachmentMeta) =>
    (item.kind === 'canvas' || item.kind === 'mindmap' || item.kind === 'web') && Boolean(sessionId)
  const chips = items.filter(item => !isArtifact(item))
  const artifacts = items.filter(isArtifact)

  const handleOpen = (item: ChatAttachmentMeta) => (e: MouseEvent) => {
    e.stopPropagation()
    onOpen(item)
  }

  return (
    <div className={mergeClasses(s.messageAttachRoot, s.stripBlock)}>
      {chips.length > 0 ? (
        <div className={mergeClasses(s.strip, s.stripMessageScroll, 'opptrix-scroll-hidden')}>
          {chips.map(item => (
            <button
              key={item.id}
              type="button"
              className={mergeClasses(s.chip, s.chipInteractive)}
              onClick={handleOpen(item)}
              title={attachmentTitle(item)}
              aria-label={`查看 ${item.name}`}
            >
              <AttachmentIcon
                item={item}
                thumbUrl={thumbUrls[item.id]}
                iconBoxClass={s.iconBox}
                spinnerSlotClass={s.spinnerSlot}
                thumbClass={s.thumb}
              />
              <span className={s.name}>{middleEllipsisFilename(item.name)}</span>
            </button>
          ))}
        </div>
      ) : null}
      {artifacts.length > 0 && sessionId ? (
        <div className={s.artifactStack}>
          {artifacts.map(item => (
            <ArtifactOpenRow
              key={item.id}
              item={item}
              onOpen={() => onOpen(item)}
              rowClass={s.artifactRow}
              iconWellClass={s.artifactIconWell}
              metaClass={s.artifactMeta}
              nameClass={s.artifactName}
              kindClass={s.artifactKind}
              openIconClass={s.artifactOpenIcon}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
