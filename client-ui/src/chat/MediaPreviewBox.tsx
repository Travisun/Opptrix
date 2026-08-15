import { useEffect, useRef, useState } from 'react'
import { makeStyles, mergeClasses, Spinner } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import type { ChatAttachmentMeta } from '../types/chat'
import {
  fetchAttachmentPreviewText,
  fetchAttachmentRawText,
  sessionAttachmentUrl,
} from '../api/client'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import CanvasPreviewHost from './CanvasPreviewHost'
import MindmapPreviewHost from './MindmapPreviewHost'
import WebPreviewHost from './WebPreviewHost'
import PdfPreviewViewer from './PdfPreviewViewer'

const useStyles = makeStyles({
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  panel: {
    position: 'relative',
    maxWidth: 'min(960px, 96vw)',
    maxHeight: '92vh',
    width: '100%',
    borderRadius: opptrixTokens.radiusLg,
    backgroundColor: opptrixCssVars.canvas,
    boxShadow: opptrixCssVars.composerFloatShadowFocus,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '12px 16px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-base)',
  },
  close: {
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    color: opptrixCssVars.textSecondary,
    display: 'inline-flex',
    padding: '4px',
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    overflow: 'auto',
  },
  bodyPdf: {
    padding: 0,
    overflow: 'hidden',
    alignItems: 'stretch',
    height: '78vh',
  },
  bodyArtifact: {
    padding: '12px',
    overflow: 'hidden',
    alignItems: 'stretch',
    minHeight: '70vh',
    height: '78vh',
  },
  bodyDocument: {
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    minHeight: '40vh',
    maxHeight: '78vh',
  },
  image: {
    maxWidth: '100%',
    maxHeight: '78vh',
    objectFit: 'contain',
  },
  media: {
    width: '100%',
    maxHeight: '78vh',
  },
  pre: {
    margin: 0,
    width: '100%',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'inherit',
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-md)',
    lineHeight: '1.6',
  },
  empty: {
    flex: 1,
    minHeight: '200px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    textAlign: 'center',
    padding: '24px 16px',
  },
  emptyTitle: {
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 600,
  },
  emptyHint: {
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.5,
    maxWidth: '32ch',
  },
  loading: {
    flex: 1,
    minHeight: '200px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
})

interface Props {
  open: boolean
  sessionId: string
  attachment: ChatAttachmentMeta | null
  onClose: () => void
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

type DocPreviewState =
  | { phase: 'loading' }
  | { phase: 'ready'; text: string }
  | { phase: 'empty' }
  | { phase: 'failed' }

function DocumentPreviewBody({
  sessionId,
  attachment,
  open,
}: {
  sessionId: string
  attachment: ChatAttachmentMeta
  open: boolean
}) {
  const s = useStyles()
  const [state, setState] = useState<DocPreviewState>({ phase: 'loading' })
  const plainText = isPlainTextAttachment(attachment)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    let timer: number | undefined
    let tries = 0
    setState({ phase: 'loading' })

    const finish = (next: DocPreviewState) => {
      if (timer != null) window.clearInterval(timer)
      timer = undefined
      if (!cancelled) setState(next)
    }

    const load = async () => {
      tries += 1
      try {
        const preview = await fetchAttachmentPreviewText(sessionId, attachment.id)
        if (cancelled) return
        if (preview.ok) {
          const text = preview.text.trim()
          finish(text ? { phase: 'ready', text: preview.text } : { phase: 'empty' })
          return
        }
        if (preview.status === 'pending' && tries < 8) return
        if (plainText) {
          const raw = await fetchAttachmentRawText(sessionId, attachment.id)
          if (cancelled) return
          if (raw.ok) {
            const text = raw.text.trim()
            finish(text ? { phase: 'ready', text: raw.text } : { phase: 'empty' })
            return
          }
        }
        finish({ phase: 'failed' })
      } catch {
        if (plainText) {
          try {
            const raw = await fetchAttachmentRawText(sessionId, attachment.id)
            if (cancelled) return
            if (raw.ok) {
              const text = raw.text.trim()
              finish(text ? { phase: 'ready', text: raw.text } : { phase: 'empty' })
              return
            }
          } catch {
            // fall through
          }
        }
        if (tries >= 6) finish({ phase: 'failed' })
      }
    }

    void load()
    timer = window.setInterval(() => { void load() }, 1200)
    return () => {
      cancelled = true
      if (timer != null) window.clearInterval(timer)
    }
  }, [open, sessionId, attachment.id, attachment.kind, attachment.mime, attachment.name, plainText])

  if (state.phase === 'loading') {
    return (
      <div className={s.loading}>
        <Spinner size="small" label={plainText ? '正在加载文本…' : '正在整理文档，请稍候…'} />
      </div>
    )
  }
  if (state.phase === 'ready') {
    return <pre className={s.pre}>{state.text}</pre>
  }
  if (state.phase === 'empty') {
    return (
      <div className={s.empty} role="status">
        <span className={s.emptyTitle}>这份文件暂时没有可显示的内容</span>
        <span className={s.emptyHint}>可换一份文件后再试，或直接发送继续对话</span>
      </div>
    )
  }
  return (
    <div className={s.empty} role="status">
      <span className={s.emptyTitle}>{plainText ? '暂时无法预览' : '暂不支持在此预览该文件'}</span>
      <span className={s.emptyHint}>
        {plainText
          ? '暂时读不出这份文本，请换一份或稍后再试'
          : '可在对话中继续使用该文件，或换一份可读文件后重试'}
      </span>
    </div>
  )
}

export default function MediaPreviewBox({ open, sessionId, attachment, onClose }: Props) {
  const s = useStyles()
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !attachment) return null

  const url = sessionAttachmentUrl(sessionId, attachment.id)
  const isPdf = attachment.kind === 'pdf'
  const isArtifact = attachment.kind === 'mindmap' || attachment.kind === 'canvas' || attachment.kind === 'web'
  const isDocument = attachment.kind === 'document' || attachment.kind === 'text'

  return (
    <div
      ref={backdropRef}
      className={s.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={`预览 ${attachment.name}`}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose()
      }}
    >
      <div className={s.panel}>
        <div className={s.header}>
          <span>{attachment.name}</span>
          <button type="button" className={s.close} onClick={onClose} aria-label="关闭预览">
            <DismissRegular fontSize={18} />
          </button>
        </div>
        <div className={mergeClasses(
          s.body,
          isPdf && s.bodyPdf,
          isArtifact && s.bodyArtifact,
          isDocument && s.bodyDocument,
        )}>
          {attachment.kind === 'image' ? (
            <img src={url} alt={attachment.name} className={s.image} />
          ) : isPdf ? (
            <PdfPreviewViewer url={url} panelVisible={open} />
          ) : attachment.kind === 'video' ? (
            <video src={url} controls className={s.media} />
          ) : attachment.kind === 'audio' ? (
            <audio src={url} controls className={s.media} />
          ) : attachment.kind === 'mindmap' ? (
            <MindmapPreviewHost
              sessionId={sessionId}
              attachmentId={attachment.id}
              name={attachment.name}
              panelVisible={open}
            />
          ) : attachment.kind === 'canvas' ? (
            <CanvasPreviewHost
              sessionId={sessionId}
              attachmentId={attachment.id}
              name={attachment.name}
              panelVisible={open}
            />
          ) : attachment.kind === 'web' ? (
            <WebPreviewHost
              sessionId={sessionId}
              attachmentId={attachment.id}
              name={attachment.name}
              panelVisible={open}
            />
          ) : isDocument ? (
            <DocumentPreviewBody
              sessionId={sessionId}
              attachment={attachment}
              open={open}
            />
          ) : (
            <div className={s.empty} role="status">
              <span className={s.emptyTitle}>暂不支持预览此文件</span>
              <span className={s.emptyHint}>可直接发送文件继续对话，或换一份可预览的文件</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
