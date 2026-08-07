import { useEffect, useRef, useState } from 'react'
import { makeStyles, mergeClasses, Spinner } from '@fluentui/react-components'
import { OpenRegular } from '@fluentui/react-icons'
import MindElixir, { type MindElixirInstance } from 'mind-elixir'
import 'mind-elixir/style.css'
import { fetchAttachmentRawText } from '../api/client'
import type { ChatAttachmentMeta } from '../types/chat'
import { ghostInteractive } from '../theme/mixins'
import { useTheme } from '../theme/ThemeContext'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { parseMindmapJson, type MindmapDoc } from './mindmapDocument'
import { mindmapDocToElixir } from './mindmapElixirBridge'

export interface MindmapInlineCardProps {
  sessionId: string
  attachment: ChatAttachmentMeta
  onOpen: () => void
}

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; doc: MindmapDoc }

const FIT_PADDING = 0.92
const RESIZE_FIT_DEBOUNCE_MS = 150

const useStyles = makeStyles({
  card: {
    ...ghostInteractive,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
    maxWidth: '420px',
    minHeight: '120px',
    maxHeight: '240px',
    boxSizing: 'border-box',
    padding: '10px 12px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.border}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    textAlign: 'left',
    color: opptrixCssVars.textPrimary,
    transitionProperty: 'border-color, background-color',
    transitionDuration: '0.15s',
    transitionTimingFunction: 'ease',
    ':hover': {
      backgroundColor: opptrixCssVars.canvas,
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
    pointerEvents: 'none',
  },
  mapHost: {
    width: '100%',
    height: '100%',
    minHeight: '100px',
    // Hide leftover mind-elixir chrome if any plugin injects it.
    '& .mind-elixir-toolbar': {
      display: 'none',
    },
  },
})

function fitMindScale(mind: MindElixirInstance): void {
  mind.scaleFit()
  const fitted = Math.max(0.1, mind.scaleVal * FIT_PADDING)
  mind.scale(fitted)
  mind.toCenter()
}

export default function MindmapInlineCard({
  sessionId,
  attachment,
  onOpen,
}: MindmapInlineCardProps) {
  const s = useStyles()
  const { resolvedScheme } = useTheme()
  const mapElRef = useRef<HTMLDivElement>(null)
  const mindRef = useRef<MindElixirInstance | null>(null)
  const seedDocRef = useRef<MindmapDoc | null>(null)
  const resizeFitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [state, setState] = useState<LoadState>({ phase: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ phase: 'loading' })
    seedDocRef.current = null
    void (async () => {
      const result = await fetchAttachmentRawText(sessionId, attachment.id)
      if (cancelled) return
      if (!result.ok) {
        setState({ phase: 'error' })
        return
      }
      const parsed = parseMindmapJson(result.text)
      if (cancelled) return
      if ('error' in parsed) {
        setState({ phase: 'error' })
        return
      }
      seedDocRef.current = parsed
      setState({ phase: 'ready', doc: parsed })
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId, attachment.id])

  useEffect(() => {
    if (state.phase !== 'ready') return
    const el = mapElRef.current
    const seed = seedDocRef.current
    if (!el || !seed) return

    const theme =
      resolvedScheme === 'dark' ? MindElixir.DARK_THEME : MindElixir.THEME
    const mind = new MindElixir({
      el,
      direction: MindElixir.SIDE,
      editable: false,
      toolBar: false,
      keypress: false,
      allowUndo: false,
      locale: 'zh_CN',
      theme,
      alignment: 'nodes',
    })
    const initErr = mind.init(mindmapDocToElixir(seed))
    if (initErr) {
      setState({ phase: 'error' })
      mind.destroy()
      return undefined
    }
    mindRef.current = mind

    let cancelled = false
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled || mindRef.current !== mind) return
        fitMindScale(mind)
      })
    })

    const onResize = () => {
      if (resizeFitTimer.current) clearTimeout(resizeFitTimer.current)
      resizeFitTimer.current = setTimeout(() => {
        resizeFitTimer.current = null
        if (cancelled || mindRef.current !== mind) return
        fitMindScale(mind)
      }, RESIZE_FIT_DEBOUNCE_MS)
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(el)

    return () => {
      cancelled = true
      if (resizeFitTimer.current) {
        clearTimeout(resizeFitTimer.current)
        resizeFitTimer.current = null
      }
      ro.disconnect()
      mind.destroy()
      mindRef.current = null
    }
    // Init once per attachment/load; theme applied in a separate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed via seedDocRef
  }, [state.phase, sessionId, attachment.id])

  useEffect(() => {
    const mind = mindRef.current
    if (!mind) return
    mind.changeTheme(
      resolvedScheme === 'dark' ? MindElixir.DARK_THEME : MindElixir.THEME,
    )
  }, [resolvedScheme])

  return (
    <button
      type="button"
      className={mergeClasses(s.card)}
      style={{ cursor: 'pointer' }}
      onClick={onOpen}
      title={`打开 ${attachment.name}`}
      aria-label={`打开脑图 ${attachment.name}`}
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
            <Spinner size="tiny" label="正在加载脑图…" />
          </div>
        ) : state.phase === 'error' ? (
          <div className={s.center}>脑图暂时无法预览</div>
        ) : state.phase === 'ready' ? (
          <div className={s.previewClip}>
            <div
              ref={mapElRef}
              className={s.mapHost}
              data-opptrix-mindmap-inline-preview=""
            />
          </div>
        ) : null}
      </div>
    </button>
  )
}
