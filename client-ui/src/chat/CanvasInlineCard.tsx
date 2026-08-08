import {
  Component,
  useEffect,
  useState,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from 'react'
import { makeStyles, mergeClasses, Spinner } from '@fluentui/react-components'
import { OpenRegular } from '@fluentui/react-icons'
import '@opptrix/canvas/styles.css'
import { fetchAttachmentRawText } from '../api/client'
import type { ChatAttachmentMeta } from '../types/chat'
import { useTheme } from '../theme/ThemeContext'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'
import { compileCanvasSource } from './compileCanvasSource'

export interface CanvasInlineCardProps {
  sessionId: string
  attachment: ChatAttachmentMeta
  onOpen: () => void
}

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; Component: ComponentType }

const PREVIEW_SCALE = 0.55

class PreviewErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    this.props.onError()
  }

  render(): ReactNode {
    if (this.state.failed) return null
    return this.props.children
  }
}

const useStyles = makeStyles({
  card: {
    ...ghostInteractive,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
    minHeight: '200px',
    maxHeight: '360px',
    boxSizing: 'border-box',
    margin: 0,
    padding: '10px 12px',
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
      backgroundColor: opptrixCssVars.canvas,
    },
    // 覆盖 ghostInteractive 的 :active opacity，避免缩放预览整卡闪抖
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
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    flexShrink: 0,
  },
  title: {
    flex: '1 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
  },
  openHint: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  center: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
  },
  previewClip: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    borderRadius: '6px',
    backgroundColor: opptrixCssVars.surface,
  },
  previewScaled: {
    width: `${100 / PREVIEW_SCALE}%`,
    transform: `scale(${PREVIEW_SCALE})`,
    transformOrigin: 'top left',
    pointerEvents: 'none',
  },
})

export default function CanvasInlineCard({
  sessionId,
  attachment,
  onOpen,
}: CanvasInlineCardProps) {
  const s = useStyles()
  const { resolvedScheme } = useTheme()
  const [state, setState] = useState<LoadState>({ phase: 'loading' })
  const [runtimeFailed, setRuntimeFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setState({ phase: 'loading' })
    setRuntimeFailed(false)
    void (async () => {
      const result = await fetchAttachmentRawText(sessionId, attachment.id)
      if (cancelled) return
      if (!result.ok) {
        setState({ phase: 'error' })
        return
      }
      const compiled = compileCanvasSource(result.text)
      if (cancelled) return
      if (!compiled.ok) {
        setState({ phase: 'error' })
        return
      }
      setState({ phase: 'ready', Component: compiled.Component })
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId, attachment.id])

  const showError = state.phase === 'error' || runtimeFailed

  return (
    <button
      type="button"
      className={mergeClasses(s.card)}
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
      title={`打开 ${attachment.name}`}
      aria-label={`打开画布 ${attachment.name}`}
    >
      <div className={s.header}>
        <span className={s.title}>{attachment.name}</span>
        <span className={s.openHint}>
          打开
          <OpenRegular fontSize={14} />
        </span>
      </div>
      <div className={s.body}>
        {state.phase === 'loading' ? (
          <div className={s.center}>
            <Spinner size="tiny" label="正在加载画布…" />
          </div>
        ) : showError ? (
          <div className={s.center}>画布暂时无法预览</div>
        ) : state.phase === 'ready' ? (
          <div className={s.previewClip}>
            <div
              className={s.previewScaled}
              data-opptrix-canvas-preview=""
              data-theme={resolvedScheme === 'dark' ? 'dark' : 'light'}
            >
              <PreviewErrorBoundary onError={() => setRuntimeFailed(true)}>
                <state.Component />
              </PreviewErrorBoundary>
            </div>
          </div>
        ) : null}
      </div>
    </button>
  )
}
