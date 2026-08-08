/**
 * Right-panel / overlay mindmap editor — mind-elixir (keeps Opptrix MindmapDoc on disk).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  makeStyles,
  mergeClasses,
  Spinner,
} from '@fluentui/react-components'
import {
  ArrowDownloadRegular,
  DocumentPdfRegular,
  ZoomInRegular,
  ZoomOutRegular,
} from '@fluentui/react-icons'
import MindElixir, {
  type MindElixirInstance,
  type Operation,
} from 'mind-elixir'
import { zh_CN } from 'mind-elixir/i18n'
import 'mind-elixir/style.css'
import {
  fetchAttachmentRawText,
  putSessionMindmapAttachment,
} from '../api/client'
import { useDebouncedEffect } from '../hooks/useDebouncedEffect'
import { ghostInteractive } from '../theme/mixins'
import { useTheme } from '../theme/ThemeContext'
import { opptrixCssVars } from '../theme/tokens'
import {
  parseMindmapJson,
  serializeMindmapDoc,
  type MindmapDoc,
} from './mindmapDocument'
import {
  elixirDataToMindmapDoc,
  mindmapDocToElixir,
} from './mindmapElixirBridge'
import FilenameEllipsis from './FilenameEllipsis'
import {
  exportMindmapBoardPdf,
  exportMindmapBoardPng,
} from './previewExport'

export interface MindmapPreviewHostProps {
  sessionId: string
  attachmentId: string
  name: string
  panelVisible?: boolean
}

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; doc: MindmapDoc }

const MIN_SCALE = 0.4
const MAX_SCALE = 2.5
const SCALE_STEP = 0.1
const SAVE_DEBOUNCE_MS = 600
const FIT_PADDING = 0.92
const RESIZE_FIT_DEBOUNCE_MS = 150

const useStyles = makeStyles({
  root: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  toolbar: {
    flexShrink: 0,
    height: '34px',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    padding: '0 8px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvas,
  },
  toolbarTitle: {
    flex: '0 1 auto',
    minWidth: 0,
    maxWidth: '46%',
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-sm)',
    userSelect: 'none',
    paddingRight: '4px',
  },
  toolBtn: {
    ...ghostInteractive,
    width: '28px',
    height: '28px',
    minWidth: '28px',
    minHeight: '28px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
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
    height: '28px',
    minHeight: '28px',
    minWidth: '28px',
    padding: '0 8px',
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
  scaleLabel: {
    flexShrink: 0,
    minWidth: '52px',
    textAlign: 'center',
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-sm)',
    fontVariantNumeric: 'tabular-nums',
    userSelect: 'none',
  },
  spacer: {
    flex: 1,
    minWidth: '4px',
  },
  statusHint: {
    flexShrink: 0,
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
  },
  statusError: {
    flexShrink: 0,
    color: opptrixCssVars.error,
    fontSize: 'var(--opptrix-font-sm)',
  },
  stage: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: opptrixCssVars.canvas,
    // Hide leftover mind-elixir chrome if any plugin injects it.
    '& .mind-elixir-toolbar': {
      display: 'none',
    },
  },
  mapHost: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    height: '100%',
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

function clampScale(v: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(v * 100) / 100))
}

function boardBackgroundColor(scheme: 'light' | 'dark'): string {
  if (scheme === 'dark') {
    return MindElixir.DARK_THEME.cssVar?.['--bgcolor'] ?? '#252526'
  }
  return '#ffffff'
}

function shouldPersistOperation(info: Operation): boolean {
  return info.name !== 'beginEdit'
}

function fitMindScale(
  mind: MindElixirInstance,
  suppressUserFlag?: { current: boolean },
): number {
  if (suppressUserFlag) suppressUserFlag.current = true
  try {
    mind.scaleFit()
    const fitted = clampScale(mind.scaleVal * FIT_PADDING)
    mind.scale(fitted)
    mind.toCenter()
    return fitted
  } finally {
    if (suppressUserFlag) suppressUserFlag.current = false
  }
}

export default function MindmapPreviewHost({
  sessionId,
  attachmentId,
  name,
  panelVisible = true,
}: MindmapPreviewHostProps) {
  const s = useStyles()
  const { resolvedScheme } = useTheme()
  const mapElRef = useRef<HTMLDivElement>(null)
  const mindRef = useRef<MindElixirInstance | null>(null)
  const versionRef = useRef(1)
  const seedDocRef = useRef<MindmapDoc | null>(null)
  const userAdjustedScale = useRef(false)
  /** Suppress bus `scale` → userAdjusted while we programmatically fit/scale. */
  const suppressScaleUserFlag = useRef(false)
  const resizeFitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [state, setState] = useState<LoadState>({ phase: 'loading' })
  const [scale, setScale] = useState(1)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveGen = useRef(0)

  useEffect(() => {
    if (!panelVisible) return
    let cancelled = false
    setState({ phase: 'loading' })
    setScale(1)
    setExportError(null)
    setSaveError(null)
    setDirty(false)
    seedDocRef.current = null
    userAdjustedScale.current = false

    void (async () => {
      const result = await fetchAttachmentRawText(sessionId, attachmentId)
      if (cancelled) return
      if (!result.ok) {
        setState({ phase: 'error', message: '暂时读不出这份脑图' })
        return
      }
      const parsed = parseMindmapJson(result.text)
      if (cancelled) return
      if ('error' in parsed) {
        setState({ phase: 'error', message: parsed.error })
        return
      }
      versionRef.current = parsed.version
      seedDocRef.current = parsed
      setState({ phase: 'ready', doc: parsed })
    })()

    return () => {
      cancelled = true
    }
  }, [sessionId, attachmentId, panelVisible])

  useEffect(() => {
    if (state.phase !== 'ready' || !panelVisible) return
    const el = mapElRef.current
    const seed = seedDocRef.current
    if (!el || !seed) return

    userAdjustedScale.current = false

    const theme =
      resolvedScheme === 'dark' ? MindElixir.DARK_THEME : MindElixir.THEME
    const mind = new MindElixir({
      el,
      direction: MindElixir.SIDE,
      editable: true,
      toolBar: false,
      keypress: true,
      allowUndo: true,
      newTopicName: '新节点',
      locale: 'zh_CN',
      contextMenu: {
        locale: zh_CN,
        focus: true,
        link: true,
      },
      theme,
      alignment: 'nodes',
      scaleMin: MIN_SCALE,
      scaleMax: MAX_SCALE,
    })
    const initErr = mind.init(mindmapDocToElixir(seed))
    if (initErr) {
      setState({ phase: 'error', message: '脑图暂时无法显示' })
      mind.destroy()
      return undefined
    }
    mindRef.current = mind
    setScale(mind.scaleVal || 1)

    const syncFromMind = () => {
      try {
        const next = elixirDataToMindmapDoc(mind.getData(), versionRef.current)
        setState({ phase: 'ready', doc: next })
        setDirty(true)
        setSaveError(null)
      } catch {
        // keep last good doc
      }
    }

    const onOperation = (info: Operation) => {
      if (!shouldPersistOperation(info)) return
      syncFromMind()
    }
    const onScale = (next: number) => {
      setScale(clampScale(next))
      // Wheel / pinch / built-in gestures count as manual zoom.
      if (!suppressScaleUserFlag.current) {
        userAdjustedScale.current = true
      }
    }

    mind.bus.addListener('operation', onOperation)
    mind.bus.addListener('scale', onScale)

    let cancelled = false
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled || mindRef.current !== mind) return
        if (userAdjustedScale.current) return
        setScale(fitMindScale(mind, suppressScaleUserFlag))
      })
    })

    const onResize = () => {
      if (resizeFitTimer.current) clearTimeout(resizeFitTimer.current)
      resizeFitTimer.current = setTimeout(() => {
        resizeFitTimer.current = null
        if (cancelled || mindRef.current !== mind) return
        if (userAdjustedScale.current) return
        setScale(fitMindScale(mind, suppressScaleUserFlag))
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
      mind.bus.removeListener('operation', onOperation)
      mind.bus.removeListener('scale', onScale)
      mind.destroy()
      mindRef.current = null
    }
    // Init once per attachment/load; theme applied in a separate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed via seedDocRef
  }, [state.phase, sessionId, attachmentId, panelVisible])

  useEffect(() => {
    const mind = mindRef.current
    if (!mind) return
    mind.changeTheme(
      resolvedScheme === 'dark' ? MindElixir.DARK_THEME : MindElixir.THEME,
    )
  }, [resolvedScheme])

  const docSnapshot = state.phase === 'ready' ? state.doc : null
  const dirtyKey =
    dirty && docSnapshot ? JSON.stringify(serializeMindmapDoc(docSnapshot)) : ''

  useDebouncedEffect(() => {
    if (!dirty || !docSnapshot) return
    const gen = ++saveGen.current
    const payload = serializeMindmapDoc(docSnapshot)
    setSaving(true)
    void (async () => {
      try {
        await putSessionMindmapAttachment(sessionId, attachmentId, payload)
        if (saveGen.current !== gen) return
        setDirty(false)
        setSaveError(null)
      } catch {
        if (saveGen.current !== gen) return
        setSaveError('未能保存脑图修改，请重试')
      } finally {
        if (saveGen.current === gen) setSaving(false)
      }
    })()
  }, [dirtyKey, sessionId, attachmentId], SAVE_DEBOUNCE_MS, true)

  const applyScale = useCallback((next: number) => {
    const mind = mindRef.current
    const clamped = clampScale(next)
    userAdjustedScale.current = true
    suppressScaleUserFlag.current = true
    try {
      if (mind) mind.scale(clamped)
    } finally {
      suppressScaleUserFlag.current = false
    }
    setScale(clamped)
  }, [])

  const onExportPng = async () => {
    const mind = mindRef.current
    if (!mind?.nodes || exporting) return
    setExporting(true)
    setExportError(null)
    try {
      await exportMindmapBoardPng(
        mind.nodes,
        name,
        boardBackgroundColor(resolvedScheme),
      )
    } catch {
      setExportError('导出图片失败，请稍后重试')
    } finally {
      setExporting(false)
    }
  }

  const onExportPdf = async () => {
    const mind = mindRef.current
    if (!mind?.nodes || exporting) return
    setExporting(true)
    setExportError(null)
    try {
      await exportMindmapBoardPdf(
        mind.nodes,
        name,
        boardBackgroundColor(resolvedScheme),
      )
    } catch {
      setExportError('导出 PDF 失败，请稍后重试')
    } finally {
      setExporting(false)
    }
  }

  const titleEl = (
    <FilenameEllipsis name={name} className={s.toolbarTitle} />
  )

  if (state.phase === 'loading') {
    return (
      <div className={s.root}>
        <div
          className={mergeClasses(s.toolbar, 'opptrix-panel-title-no-drag')}
          role="toolbar"
          aria-label="脑图预览"
        >
          {titleEl}
          <span className={s.spacer} />
        </div>
        <div className={s.center}>
          <Spinner size="small" label="正在加载脑图…" />
        </div>
      </div>
    )
  }

  if (state.phase === 'error') {
    return (
      <div className={s.root}>
        <div
          className={mergeClasses(s.toolbar, 'opptrix-panel-title-no-drag')}
          role="toolbar"
          aria-label="脑图预览"
        >
          {titleEl}
          <span className={s.spacer} />
        </div>
        <div className={s.center}>
          <span className={s.errTitle}>脑图暂时无法显示</span>
          <span className={s.errDetail}>{state.message}</span>
        </div>
      </div>
    )
  }

  const statusText = saveError
    ? null
    : exportError
      ? null
      : saving
        ? '正在保存…'
        : dirty
          ? '有未保存的修改'
          : null

  return (
    <div className={s.root}>
      <div
        className={mergeClasses(s.toolbar, 'opptrix-panel-title-no-drag')}
        role="toolbar"
        aria-label="脑图预览"
      >
        {titleEl}
        <span className={s.spacer} />
        {saveError ? (
          <span className={s.statusError}>{saveError}</span>
        ) : exportError ? (
          <span className={s.statusError}>{exportError}</span>
        ) : statusText ? (
          <span className={s.statusHint}>{statusText}</span>
        ) : null}
        <button
          type="button"
          className={s.toolBtn}
          onClick={() => applyScale(scale - SCALE_STEP)}
          disabled={scale <= MIN_SCALE}
          aria-label="缩小"
          title="缩小"
        >
          <ZoomOutRegular fontSize={16} />
        </button>
        <span className={s.scaleLabel}>{Math.round(scale * 100)}%</span>
        <button
          type="button"
          className={s.toolBtn}
          onClick={() => applyScale(scale + SCALE_STEP)}
          disabled={scale >= MAX_SCALE}
          aria-label="放大"
          title="放大"
        >
          <ZoomInRegular fontSize={16} />
        </button>
        <button
          type="button"
          className={s.toolBtnText}
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
          className={s.toolBtnText}
          onClick={() => void onExportPdf()}
          disabled={exporting}
          aria-label="下载 PDF"
          title="下载 PDF"
        >
          <DocumentPdfRegular fontSize={16} />
          PDF
        </button>
      </div>
      <div className={s.stage}>
        <div
          ref={mapElRef}
          className={s.mapHost}
          data-opptrix-mindmap-preview=""
        />
      </div>
    </div>
  )
}
