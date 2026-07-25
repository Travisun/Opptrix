import { useEffect, useRef } from 'react'
import { makeStyles } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import type { ChatAttachmentMeta } from '../types/chat'
import { sessionAttachmentUrl } from '../api/client'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'

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
  image: {
    maxWidth: '100%',
    maxHeight: '78vh',
    objectFit: 'contain',
  },
  pdf: {
    width: '100%',
    height: '78vh',
    border: 'none',
  },
  media: {
    width: '100%',
    maxHeight: '78vh',
  },
})

interface Props {
  open: boolean
  sessionId: string
  attachment: ChatAttachmentMeta | null
  onClose: () => void
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
        <div className={s.body}>
          {attachment.kind === 'image' ? (
            <img src={url} alt={attachment.name} className={s.image} />
          ) : attachment.kind === 'pdf' ? (
            <iframe src={url} title={attachment.name} className={s.pdf} />
          ) : attachment.kind === 'video' ? (
            <video src={url} controls className={s.media} />
          ) : attachment.kind === 'audio' ? (
            <audio src={url} controls className={s.media} />
          ) : null}
        </div>
      </div>
    </div>
  )
}
