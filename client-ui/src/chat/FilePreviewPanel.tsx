import { useEffect, useState } from 'react'
import { Spinner, makeStyles, mergeClasses } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import type { ChatAttachmentMeta, MediaKind } from '../types/chat'
import {
  fetchAttachmentPreviewText,
  fetchAttachmentRawText,
  fetchSessionAttachmentMeta,
  sessionAttachmentUrl,
} from '../api/client'
import { attachmentKindIcon } from './attachmentKindIcon'
import CanvasPreviewHost from './CanvasPreviewHost'
import MarkdownMessage from './MarkdownMessage'
import MindmapPreviewHost from './MindmapPreviewHost'
import PdfPreviewViewer from './PdfPreviewViewer'
import { formatBytesShort } from './mediaCapabilities'
import { DESKTOP_TITLEBAR_HEIGHT, DESKTOP_Z_PANEL_TITLE } from '../desktop/constants'
import { electronPlatform } from '../platform/detect'
import { opptrixCssVars } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'

const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace'

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
    height: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: opptrixCssVars.canvas,
  },
  header: {
    flexShrink: 0,
    height: `${DESKTOP_TITLEBAR_HEIGHT}px`,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: '0',
    paddingLeft: '0',
    paddingRight: '8px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvas,
    position: 'relative',
    zIndex: DESKTOP_Z_PANEL_TITLE,
  },
  headerWeb: {
    height: '40px',
    zIndex: 1,
  },
  headerElectronWin: {
    paddingRight: '12px',
  },
  headerElectronMac: {
    paddingRight: '12px',
  },
  titleBarDragLead: {
    flex: '0 0 auto',
    alignSelf: 'stretch',
    minWidth: '8px',
  },
  titleCluster: {
    flex: '0 1 auto',
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    paddingLeft: '14px',
    overflow: 'hidden',
  },
  headerIcon: {
    flexShrink: 0,
    display: 'inline-flex',
    color: opptrixCssVars.textSecondary,
  },
  name: {
    flex: '0 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-base)',
  },
  metaLabel: {
    flexShrink: 0,
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
    whiteSpace: 'nowrap',
  },
  dragFill: {
    flex: '1 1 auto',
    minWidth: '8px',
    alignSelf: 'stretch',
  },
  close: {
    ...ghostInteractive,
    flexShrink: 0,
    width: '28px',
    height: '28px',
    minWidth: '28px',
    minHeight: '28px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    color: opptrixCssVars.textSecondary,
    WebkitAppRegion: 'no-drag',
    pointerEvents: 'auto',
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
  },
  bodyFlush: {
    padding: 0,
    overflow: 'hidden',
  },
  artifactHost: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    padding: '12px 16px 16px',
    boxSizing: 'border-box',
  },
  imageWrap: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
  },
  loading: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pre: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'inherit',
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-md)',
    lineHeight: '1.6',
  },
  preMono: {
    fontFamily: MONO_FONT,
  },
  unsupported: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    textAlign: 'center',
    padding: '16px',
  },
  unsupportedTitle: {
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-base)',
  },
  unsupportedHint: {
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
  },
  unsupportedDetail: {
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
    wordBreak: 'break-word',
  },
})

export interface FilePreviewTarget {
  sessionId: string
  attachment: ChatAttachmentMeta
}

interface Props {
  sessionId: string
  attachment: ChatAttachmentMeta
  panelVisible: boolean
  onClose: () => void
  electronChrome?: boolean
  chatColumnVisible?: boolean
  /** Skip left global toolbar band when sidebar overlay + panel spans full width. */
  chromeToolbarReserve?: number
  /** Right panel occupies full workspace width (chat column hidden). */
  panelFullWidth?: boolean
}

function headerLabel(attachment: ChatAttachmentMeta): string {
  const kind = KIND_LABEL[attachment.kind] ?? '文件'
  return `${kind} · ${formatBytesShort(attachment.size)}`
}

function isMarkdown(name: string): boolean {
  return /\.(md|markdown)$/i.test(name)
}

function isMonospaceText(name: string): boolean {
  return /\.(txt|csv|json)$/i.test(name)
}

function isPlainTextAttachment(attachment: ChatAttachmentMeta): boolean {
  if (attachment.kind === 'text') return true
  const mime = attachment.mime.toLowerCase().split(';')[0]?.trim() ?? ''
  if (
    mime === 'text/plain'
    || mime === 'text/markdown'
    || mime === 'text/x-markdown'
    || mime === 'text/csv'
    || mime === 'application/json'
    || mime === 'application/xml'
    || mime === 'text/xml'
    || mime === 'text/html'
  ) {
    return true
  }
  return /\.(txt|md|markdown|csv|json|xml|html|htm|log)$/i.test(attachment.name)
}

async function fetchDocumentPreviewResult(
  sessionId: string,
  attachment: ChatAttachmentMeta,
): Promise<{ phase: 'ready'; text: string } | { phase: 'failed'; message: string | null } | { phase: 'pending' }> {
  const meta = await fetchSessionAttachmentMeta(sessionId, attachment.id)
  const status = meta.extract?.status
  const plainText = isPlainTextAttachment(meta) || isPlainTextAttachment(attachment)

  // 纯文本：先试 extract/text；失败则直读原文（不依赖服务端 extract）
  if (plainText) {
    const res = await fetchAttachmentPreviewText(sessionId, attachment.id)
    if (res.ok) return { phase: 'ready', text: res.text }
    const raw = await fetchAttachmentRawText(sessionId, attachment.id)
    if (raw.ok) return { phase: 'ready', text: raw.text }
    // 仅展示固定友好短句，不透传技术向 extract 错误
    return { phase: 'failed', message: null }
  }

  if (status === 'ready') {
    const res = await fetchAttachmentPreviewText(sessionId, attachment.id)
    if (res.ok) return { phase: 'ready', text: res.text }
    if (res.status === 'failed') return { phase: 'failed', message: res.message ?? null }
    return { phase: 'pending' }
  }

  if (status === 'failed') {
    return { phase: 'failed', message: meta.extract?.error ?? null }
  }
  return { phase: 'pending' }
}

function UnsupportedState({
  title = '暂不支持预览此文件',
  hint,
  detail,
}: {
  title?: string
  hint?: string
  detail?: string
}) {
  const s = useStyles()
  return (
    <div className={s.unsupported}>
      <span className={s.unsupportedTitle}>{title}</span>
      {hint ? <span className={s.unsupportedHint}>{hint}</span> : null}
      {detail ? <span className={s.unsupportedDetail}>{detail}</span> : null}
    </div>
  )
}

function useDocumentText(
  sessionId: string,
  attachment: ChatAttachmentMeta,
  panelVisible: boolean,
) {
  const [phase, setPhase] = useState<'pending' | 'ready' | 'failed'>('pending')
  const [text, setText] = useState('')
  const [failed, setFailed] = useState<string | null>(null)
  const { id, extract } = attachment
  const plainText = isPlainTextAttachment(attachment)

  useEffect(() => {
    if (!panelVisible) return
    let cancelled = false
    let timer: number | undefined
    let consecutiveErrors = 0
    const stop = () => {
      if (timer != null) window.clearInterval(timer)
      timer = undefined
    }
    const finish = (next: { phase: 'ready'; text: string } | { phase: 'failed'; message: string | null }) => {
      stop()
      setPhase(next.phase)
      if (next.phase === 'ready') setText(next.text)
      else setFailed(next.message)
    }
    // 纯文本即使 meta 已标 failed，仍尝试拉原文预览
    if (extract?.status === 'failed' && !plainText) {
      finish({ phase: 'failed', message: extract.error ?? null })
      return
    }
    const poll = async () => {
      if (cancelled) return
      try {
        const result = await fetchDocumentPreviewResult(sessionId, attachment)
        if (cancelled) return
        consecutiveErrors = 0
        if (result.phase === 'pending') return
        finish(result)
      } catch {
        if (++consecutiveErrors > 6) finish({ phase: 'failed', message: '该文件暂时无法预览' })
      }
    }
    setPhase('pending')
    void poll()
    timer = window.setInterval(() => { void poll() }, 1200)
    return () => { cancelled = true; stop() }
  }, [panelVisible, sessionId, id, extract, plainText, attachment.kind, attachment.mime, attachment.name])

  return { phase, text, failed, plainText }
}

function DocumentPreview({
  sessionId,
  attachment,
  panelVisible,
}: {
  sessionId: string
  attachment: ChatAttachmentMeta
  panelVisible: boolean
}) {
  const s = useStyles()
  const { phase, text, failed, plainText } = useDocumentText(sessionId, attachment, panelVisible)

  if (phase === 'failed') {
    return (
      <UnsupportedState
        title={plainText ? '暂时无法预览' : '文档未能整理'}
        hint={plainText ? '暂时读不出这份文本，请换一份或稍后再试' : '可尝试上传可读文件后重新预览'}
        detail={failed ?? undefined}
      />
    )
  }
  if (phase === 'pending') {
    return (
      <div className={s.loading}>
        <Spinner size="small" label={plainText ? '正在加载文本…' : '正在整理文档，请稍候…'} />
      </div>
    )
  }
  if (isMarkdown(attachment.name)) {
    return <MarkdownMessage content={text} />
  }
  return (
    <pre className={mergeClasses(s.pre, isMonospaceText(attachment.name) && s.preMono)}>
      {text}
    </pre>
  )
}

export default function FilePreviewPanel({
  sessionId,
  attachment,
  panelVisible,
  onClose,
  electronChrome = false,
  chatColumnVisible = true,
  chromeToolbarReserve = 0,
  panelFullWidth = false,
}: Props) {
  const s = useStyles()
  const url = sessionAttachmentUrl(sessionId, attachment.id)
  const isPdf = attachment.kind === 'pdf'
  const isCanvas = attachment.kind === 'canvas'
  const isMindmap = attachment.kind === 'mindmap'
  const bodyFlush = isPdf || isCanvas || isMindmap
  const electronWin = electronChrome && electronPlatform() !== 'darwin'
  /** Full-width panel: reserve global toolbar band as a dedicated drag zone. */
  const titleBarDragLeadWidth = electronChrome
    && panelFullWidth
    && !chatColumnVisible
    && chromeToolbarReserve > 0
    ? chromeToolbarReserve
    : 0

  return (
    <div className={s.root}>
      <div
        className={mergeClasses(
          s.header,
          !electronChrome && s.headerWeb,
          electronChrome && 'opptrix-right-panel-title-bar',
          electronChrome && (electronWin ? s.headerElectronWin : s.headerElectronMac),
        )}
      >
        {titleBarDragLeadWidth > 0 && (
          <div
            className={mergeClasses(s.titleBarDragLead, 'opptrix-right-panel-title-drag')}
            style={{ width: `${titleBarDragLeadWidth}px` }}
            aria-hidden
          />
        )}
        <div className={mergeClasses(s.titleCluster, 'opptrix-panel-title-no-drag')}>
          <span className={s.headerIcon}>{attachmentKindIcon(attachment.kind, attachment.name)}</span>
          <span className={s.name} title={attachment.name}>
            {attachment.name}
          </span>
          <span className={s.metaLabel}>{headerLabel(attachment)}</span>
        </div>
        <div
          className={mergeClasses(
            s.dragFill,
            electronChrome && 'opptrix-right-panel-title-drag',
          )}
          aria-hidden
        />
        <button
          type="button"
          className={mergeClasses(s.close, 'opptrix-panel-title-no-drag')}
          onClick={onClose}
          aria-label="关闭预览"
          title="关闭预览"
        >
          <DismissRegular fontSize={18} />
        </button>
      </div>
      <div className={mergeClasses(s.body, bodyFlush && s.bodyFlush)}>
        {attachment.kind === 'image' ? (
          <div className={s.imageWrap}>
            <img src={url} alt={attachment.name} className={s.image} />
          </div>
        ) : isPdf ? (
          <PdfPreviewViewer url={url} panelVisible={panelVisible} />
        ) : isCanvas ? (
          <div className={s.artifactHost}>
            <CanvasPreviewHost
              sessionId={sessionId}
              attachmentId={attachment.id}
              name={attachment.name}
              panelVisible={panelVisible}
            />
          </div>
        ) : isMindmap ? (
          <div className={s.artifactHost}>
            <MindmapPreviewHost
              sessionId={sessionId}
              attachmentId={attachment.id}
              name={attachment.name}
              panelVisible={panelVisible}
            />
          </div>
        ) : attachment.kind === 'document' ? (
          <DocumentPreview
            sessionId={sessionId}
            attachment={attachment}
            panelVisible={panelVisible}
          />
        ) : attachment.kind === 'video' || attachment.kind === 'audio' ? (
          <UnsupportedState hint="您可以直接发送该文件继续对话" />
        ) : (
          <UnsupportedState />
        )}
      </div>
    </div>
  )
}
