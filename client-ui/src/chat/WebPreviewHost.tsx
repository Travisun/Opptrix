/**
 * 网页制品预览：iframe 加载 /api/sessions/.../attachments/:id/web/index.html
 * sandbox 禁顶层导航；CSP 由服务端响应头约束外网 connect。
 * 导出长图/PDF 经服务端 Playwright fullPage（iframe 无 allow-same-origin，父页不可读 DOM）。
 */
import { useCallback, useEffect, useState } from 'react'
import { Spinner, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  ArrowClockwiseRegular,
  ArrowDownloadRegular,
  DocumentPdfRegular,
} from '@fluentui/react-icons'
import { fetchWebAttachmentExportPng, sessionAttachmentWebUrl } from '../api/client'
import { opptrixCssVars } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'
import FilenameEllipsis from './FilenameEllipsis'
import { downloadPngBlob, exportPngBlobToPdf } from './previewExport'

export interface WebPreviewHostProps {
  sessionId: string
  attachmentId: string
  name: string
  panelVisible?: boolean
}

const useStyles = makeStyles({
  root: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: opptrixCssVars.canvas,
  },
  toolbar: {
    flexShrink: 0,
    height: '34px',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '0 8px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvas,
  },
  title: {
    flex: '1 1 auto',
    minWidth: 0,
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-sm)',
  },
  toolBtn: {
    ...ghostInteractive,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    margin: 0,
    padding: 0,
    border: 'none',
    borderRadius: '6px',
    background: 'transparent',
    color: opptrixCssVars.textSecondary,
    cursor: 'pointer',
    ':disabled': {
      opacity: 0.35,
      cursor: 'default',
      ':hover': {
        backgroundColor: 'transparent',
      },
    },
  },
  toolBtnText: {
    ...ghostInteractive,
    flexShrink: 0,
    height: '28px',
    minHeight: '28px',
    minWidth: '28px',
    margin: 0,
    padding: '0 8px',
    border: 'none',
    borderRadius: '6px',
    background: 'transparent',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-sm)',
    cursor: 'pointer',
    ':disabled': {
      opacity: 0.35,
      cursor: 'default',
      ':hover': {
        backgroundColor: 'transparent',
      },
    },
  },
  exportHint: {
    flexShrink: 0,
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
    paddingRight: '4px',
    userSelect: 'none',
  },
  frameWrap: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    backgroundColor: opptrixCssVars.surface,
  },
  iframe: {
    width: '100%',
    height: '100%',
    border: 'none',
    display: 'block',
    backgroundColor: '#fff',
  },
  center: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '24px',
    textAlign: 'center',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
    pointerEvents: 'none',
  },
  emptyTitle: {
    color: opptrixCssVars.textPrimary,
    fontWeight: 600,
    fontSize: 'var(--opptrix-font-base)',
  },
  emptyHint: {
    color: opptrixCssVars.textSecondary,
    maxWidth: '28ch',
    lineHeight: 1.55,
  },
  exportBanner: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 10px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvas,
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.45,
  },
  exportBannerText: {
    flex: 1,
    minWidth: 0,
  },
  exportBannerDismiss: {
    ...ghostInteractive,
    flexShrink: 0,
    border: 'none',
    background: 'transparent',
    color: opptrixCssVars.textSecondary,
    cursor: 'pointer',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: 'var(--opptrix-font-sm)',
  },
})

export default function WebPreviewHost({
  sessionId,
  attachmentId,
  name,
  panelVisible = true,
}: WebPreviewHostProps) {
  const s = useStyles()
  const [nonce, setNonce] = useState(0)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const src = panelVisible
    ? `${sessionAttachmentWebUrl(sessionId, attachmentId)}?t=${nonce}`
    : ''

  useEffect(() => {
    if (!panelVisible) return
    setPhase('loading')
    setExportError(null)
  }, [panelVisible, sessionId, attachmentId, nonce])

  const onLoad = useCallback(() => {
    setPhase('ready')
  }, [])

  const onError = useCallback(() => {
    setPhase('error')
  }, [])

  const refresh = useCallback(() => {
    setNonce(n => n + 1)
  }, [])

  const runExport = useCallback(
    async (mode: 'png' | 'pdf') => {
      if (exporting || phase !== 'ready') return
      setExporting(true)
      setExportError(null)
      try {
        const result = await fetchWebAttachmentExportPng(sessionId, attachmentId)
        if (!result.ok) {
          setExportError(result.message)
          return
        }
        if (mode === 'png') {
          downloadPngBlob(result.blob, name)
        } else {
          await exportPngBlobToPdf(result.blob, name)
        }
      } catch {
        setExportError(
          mode === 'png'
            ? '下载长图失败，请稍后重试'
            : '下载 PDF 失败，请稍后重试',
        )
      } finally {
        setExporting(false)
      }
    },
    [attachmentId, exporting, name, phase, sessionId],
  )

  if (!panelVisible) {
    return <div className={s.root} />
  }

  const canExport = phase === 'ready' && !exporting

  return (
    <div className={s.root}>
      <div className={mergeClasses(s.toolbar, 'opptrix-panel-title-no-drag')} role="toolbar" aria-label="网页预览">
        <FilenameEllipsis className={s.title} name={name} />
        {exporting ? <span className={s.exportHint}>正在导出…</span> : null}
        <button
          type="button"
          className={s.toolBtnText}
          onClick={() => void runExport('png')}
          disabled={!canExport}
          title="下载长图"
          aria-label="下载长图"
        >
          <ArrowDownloadRegular fontSize={16} />
          长图
        </button>
        <button
          type="button"
          className={s.toolBtnText}
          onClick={() => void runExport('pdf')}
          disabled={!canExport}
          title="下载 PDF"
          aria-label="下载 PDF"
        >
          <DocumentPdfRegular fontSize={16} />
          PDF
        </button>
        <button
          type="button"
          className={mergeClasses(s.toolBtn)}
          onClick={refresh}
          disabled={exporting}
          title="刷新预览"
          aria-label="刷新预览"
        >
          <ArrowClockwiseRegular fontSize={16} />
        </button>
      </div>
      {exportError ? (
        <div className={s.exportBanner} role="alert">
          <span className={s.exportBannerText}>{exportError}</span>
          <button
            type="button"
            className={s.exportBannerDismiss}
            onClick={() => setExportError(null)}
          >
            知道了
          </button>
        </div>
      ) : null}
      <div className={s.frameWrap}>
        {phase === 'loading' ? (
          <div className={s.center}>
            <Spinner size="small" label="正在加载网页…" />
          </div>
        ) : null}
        {phase === 'error' ? (
          <div className={s.center} style={{ pointerEvents: 'auto' }}>
            <span className={s.emptyTitle}>网页暂时无法预览</span>
            <span className={s.emptyHint}>请刷新后再试，或让助手重新生成这份网页</span>
          </div>
        ) : null}
        {src ? (
          <iframe
            key={src}
            className={s.iframe}
            title={name}
            src={src}
            sandbox="allow-scripts allow-forms allow-modals"
            referrerPolicy="no-referrer"
            onLoad={onLoad}
            onError={onError}
          />
        ) : null}
      </div>
    </div>
  )
}
