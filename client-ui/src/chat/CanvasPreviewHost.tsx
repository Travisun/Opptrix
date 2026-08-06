/**
 * Canvas preview host — same-window Sucrase + whitelist Function MVP.
 * Security: not sandboxed; see compileCanvasSource.ts. Prefer iframe later.
 */
import {
  Component,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
  type WheelEvent,
} from 'react'
import { Spinner, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  AddRegular,
  ArrowDownloadRegular,
  DocumentPdfRegular,
  SubtractRegular,
} from '@fluentui/react-icons'
import '@opptrix/canvas/styles.css'
import { fetchAttachmentRawText } from '../api/client'
import { useTheme } from '../theme/ThemeContext'
import { opptrixCssVars } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'
import { compileCanvasSource } from './compileCanvasSource'
import { exportElementPdf, exportElementPng } from './previewExport'

const MIN_SCALE = 0.5
const MAX_SCALE = 2
const SCALE_STEP = 0.1

export interface CanvasPreviewHostProps {
  sessionId: string
  attachmentId: string
  name: string
  panelVisible?: boolean
}

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; Component: ComponentType }

class PreviewErrorBoundary extends Component<
  { children: ReactNode; onError: (message: string) => void },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.props.onError(error.message.slice(0, 160))
  }

  render(): ReactNode {
    if (this.state.failed) return null
    return this.props.children
  }
}

const useStyles = makeStyles({
  root: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  toolbar: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    justifyContent: 'flex-end',
  },
  toolBtn: {
    ...ghostInteractive,
    height: '28px',
    minHeight: '28px',
    padding: '0 8px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-sm)',
    WebkitAppRegion: 'no-drag',
  },
  scaleLabel: {
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
    minWidth: '40px',
    textAlign: 'center',
  },
  stage: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    backgroundColor: opptrixCssVars.surface,
    borderRadius: '8px',
    border: `1px solid ${opptrixCssVars.separator}`,
  },
  stageInner: {
    padding: '16px',
    width: '100%',
    boxSizing: 'border-box',
    transformOrigin: 'top left',
  },
  center: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    textAlign: 'center',
    padding: '16px',
  },
  errTitle: {
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-base)',
  },
  errDetail: {
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
    wordBreak: 'break-word',
    maxWidth: '420px',
  },
})

export default function CanvasPreviewHost({
  sessionId,
  attachmentId,
  name,
  panelVisible = true,
}: CanvasPreviewHostProps) {
  const s = useStyles()
  const { resolvedScheme } = useTheme()
  const previewRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<LoadState>({ phase: 'loading' })
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [scale, setScale] = useState(1)

  const clampScale = (v: number) =>
    Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(v * 100) / 100))

  useEffect(() => {
    if (!panelVisible) return
    let cancelled = false
    setState({ phase: 'loading' })
    setRuntimeError(null)
    setScale(1)

    void (async () => {
      const result = await fetchAttachmentRawText(sessionId, attachmentId)
      if (cancelled) return
      if (!result.ok) {
        setState({ phase: 'error', message: '暂时读不出这份画布' })
        return
      }
      const compiled = compileCanvasSource(result.text)
      if (cancelled) return
      if (!compiled.ok) {
        setState({ phase: 'error', message: compiled.error })
        return
      }
      setState({ phase: 'ready', Component: compiled.Component })
    })()

    return () => {
      cancelled = true
    }
  }, [sessionId, attachmentId, panelVisible])

  const onExportPng = async () => {
    const el = previewRef.current
    if (!el || exporting) return
    setExporting(true)
    try {
      await exportElementPng(el, name)
    } catch {
      setRuntimeError('导出图片失败，请稍后重试')
    } finally {
      setExporting(false)
    }
  }

  const onExportPdf = async () => {
    const el = previewRef.current
    if (!el || exporting) return
    setExporting(true)
    try {
      await exportElementPdf(el, name)
    } catch {
      setRuntimeError('导出 PDF 失败，请稍后重试')
    } finally {
      setExporting(false)
    }
  }

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP
    setScale((prev) => clampScale(prev + delta))
  }

  if (state.phase === 'loading') {
    return (
      <div className={s.center}>
        <Spinner size="small" label="正在加载画布…" />
      </div>
    )
  }

  if (state.phase === 'error' || runtimeError) {
    return (
      <div className={s.center}>
        <span className={s.errTitle}>画布暂时无法显示</span>
        <span className={s.errDetail}>
          {runtimeError ?? (state.phase === 'error' ? state.message : '')}
        </span>
      </div>
    )
  }

  const Comp = state.Component

  return (
    <div className={s.root}>
      <div className={mergeClasses(s.toolbar, 'opptrix-panel-title-no-drag')}>
        <button
          type="button"
          className={s.toolBtn}
          onClick={() => setScale((v) => clampScale(v - SCALE_STEP))}
          aria-label="缩小"
          title="缩小"
        >
          <SubtractRegular fontSize={16} />
        </button>
        <span className={s.scaleLabel}>{Math.round(scale * 100)}%</span>
        <button
          type="button"
          className={s.toolBtn}
          onClick={() => setScale((v) => clampScale(v + SCALE_STEP))}
          aria-label="放大"
          title="放大"
        >
          <AddRegular fontSize={16} />
        </button>
        <button
          type="button"
          className={s.toolBtn}
          onClick={() => void onExportPng()}
          disabled={exporting}
          aria-label="下载图片"
          title="下载图片"
        >
          <ArrowDownloadRegular fontSize={16} />
          图片
        </button>
        <button
          type="button"
          className={s.toolBtn}
          onClick={() => void onExportPdf()}
          disabled={exporting}
          aria-label="下载 PDF"
          title="下载 PDF"
        >
          <DocumentPdfRegular fontSize={16} />
          PDF
        </button>
      </div>
      <div className={s.stage} onWheel={onWheel}>
        <div
          className={s.stageInner}
          ref={previewRef}
          style={{ transform: `scale(${scale})` }}
          data-opptrix-canvas-preview=""
          data-theme={resolvedScheme === 'dark' ? 'dark' : 'light'}
        >
          <PreviewErrorBoundary
            onError={(message) => {
              setRuntimeError(message)
            }}
          >
            <Comp />
          </PreviewErrorBoundary>
        </div>
      </div>
    </div>
  )
}
