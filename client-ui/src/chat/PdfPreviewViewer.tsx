import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Spinner, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  ArrowFitRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  TextBulletListTreeRegular,
  ZoomInRegular,
  ZoomOutRegular,
} from '@fluentui/react-icons'
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { opptrixCssVars } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'

GlobalWorkerOptions.workerSrc = pdfWorker

const FAIL_MESSAGE = '暂时无法打开这份文档，请稍后重试'
const LOADING_LABEL = '正在打开文档…'
const ZOOM_STEP = 1.2
const ZOOM_MIN = 0.5
const ZOOM_MAX = 3
const OUTLINE_WIDTH = 170
/** A4 高宽比，未渲染页占位用 */
const DEFAULT_PAGE_ASPECT = 1.414

interface Props {
  url: string
  panelVisible?: boolean
}

/** pdf.js outline dest：命名目标、显式数组，或页面 Ref */
type OutlineDest = string | unknown[] | { num: number; gen: number } | null

interface OutlineNode {
  title: string
  dest: OutlineDest
  items: OutlineNode[]
}

type LoadPhase = 'idle' | 'loading' | 'ready' | 'failed'

function isRefProxy(v: unknown): v is { num: number; gen: number } {
  if (typeof v !== 'object' || v === null) return false
  const rec = v as { num?: unknown; gen?: unknown }
  return typeof rec.num === 'number' && typeof rec.gen === 'number'
}

function normalizeOutlineDest(dest: unknown): OutlineDest {
  if (dest == null) return null
  if (typeof dest === 'string') return dest
  if (Array.isArray(dest)) return dest
  if (isRefProxy(dest)) return { num: dest.num, gen: dest.gen }
  return null
}

function mapOutline(raw: unknown): OutlineNode[] {
  if (raw == null || !Array.isArray(raw)) return []
  const out: OutlineNode[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const rec = item as {
      title?: unknown
      dest?: unknown
      items?: unknown
    }
    const rawTitle = typeof rec.title === 'string' ? rec.title.trim() : ''
    out.push({
      title: rawTitle || '未命名',
      dest: normalizeOutlineDest(rec.dest),
      items: mapOutline(rec.items),
    })
  }
  return out
}

async function resolveDestPage(
  pdf: PDFDocumentProxy,
  dest: OutlineDest,
): Promise<number | null> {
  if (dest == null) return null
  try {
    let explicit: unknown[] | null = null
    if (typeof dest === 'string') {
      const named = await pdf.getDestination(dest)
      explicit = Array.isArray(named) ? named : null
    } else if (Array.isArray(dest)) {
      explicit = dest
    } else if (isRefProxy(dest)) {
      try {
        const index = await pdf.getPageIndex(dest)
        return index + 1
      } catch {
        return null
      }
    } else {
      return null
    }
    if (!Array.isArray(explicit) || explicit.length === 0) return null
    const first = explicit[0]
    if (isRefProxy(first)) {
      const index = await pdf.getPageIndex(first)
      return index + 1
    }
    if (typeof first === 'number' && Number.isFinite(first)) {
      return Math.floor(first) + 1
    }
    return null
  } catch {
    return null
  }
}

const useStyles = makeStyles({
  root: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
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
    gap: '2px',
    padding: '0 8px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvas,
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
  toolBtnActive: {
    backgroundColor: opptrixCssVars.surfaceHover,
    color: opptrixCssVars.textPrimary,
  },
  pageLabel: {
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
  main: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  outline: {
    flexShrink: 0,
    width: `${OUTLINE_WIDTH}px`,
    boxSizing: 'border-box',
    borderRight: `1px solid ${opptrixCssVars.separator}`,
    overflow: 'auto',
    padding: '6px 0',
    backgroundColor: opptrixCssVars.canvasAlt,
  },
  outlineItem: {
    ...ghostInteractive,
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    textAlign: 'left',
    padding: '5px 10px',
    border: 'none',
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.35,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  pageArea: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'auto',
    padding: '8px',
    backgroundColor: opptrixCssVars.canvasMuted,
  },
  pagesColumn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
  },
  pageSlot: {
    display: 'flex',
    justifyContent: 'center',
    width: '100%',
    flexShrink: 0,
  },
  canvas: {
    display: 'block',
    maxWidth: '100%',
    height: 'auto',
    backgroundColor: opptrixCssVars.canvas,
    boxShadow: `0 0 0 1px ${opptrixCssVars.border}`,
  },
  status: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    textAlign: 'center',
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-base)',
  },
})

function OutlineTree({
  nodes,
  depth,
  onNavigate,
  className,
}: {
  nodes: OutlineNode[]
  depth: number
  onNavigate: (node: OutlineNode) => void
  className: string
}): ReactNode {
  if (!nodes.length) return null
  return (
    <>
      {nodes.map((node, index) => {
        const key = `${depth}-${index}-${node.title}`
        return (
          <div key={key}>
            <button
              type="button"
              className={className}
              style={{ paddingLeft: `${10 + depth * 12}px` }}
              title={node.title}
              onClick={() => onNavigate(node)}
            >
              {node.title}
            </button>
            <OutlineTree
              nodes={node.items}
              depth={depth + 1}
              onNavigate={onNavigate}
              className={className}
            />
          </div>
        )
      })}
    </>
  )
}

function PdfPageSlot({
  pdf,
  pageNumber,
  zoom,
  containerWidth,
  active,
  className,
  canvasClassName,
  onRegister,
}: {
  pdf: PDFDocumentProxy
  pageNumber: number
  zoom: number
  containerWidth: number
  active: boolean
  className: string
  canvasClassName: string
  onRegister: (pageNumber: number, el: HTMLDivElement | null) => void
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  const [slotHeight, setSlotHeight] = useState<number | undefined>()

  useEffect(() => {
    const el = wrapRef.current
    onRegister(pageNumber, el)
    return () => onRegister(pageNumber, null)
  }, [pageNumber, onRegister])

  useEffect(() => {
    if (!active || containerWidth <= 0) {
      const task = renderTaskRef.current
      renderTaskRef.current = null
      if (task) {
        try {
          task.cancel()
        } catch {
          // ignore cancel races
        }
      }
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false

    const run = async () => {
      const prev = renderTaskRef.current
      if (prev) {
        try {
          prev.cancel()
        } catch {
          // ignore
        }
        renderTaskRef.current = null
      }

      try {
        const pdfPage = await pdf.getPage(pageNumber)
        if (cancelled) return

        const baseViewport = pdfPage.getViewport({ scale: 1 })
        const available = Math.max(containerWidth - 16, 40)
        const fitScale = available / baseViewport.width
        const scale = fitScale * zoom
        const viewport = pdfPage.getViewport({ scale })
        const outputScale = window.devicePixelRatio || 1

        const cssWidth = Math.floor(viewport.width)
        const cssHeight = Math.floor(viewport.height)
        setSlotHeight(cssHeight)

        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        canvas.style.width = `${cssWidth}px`
        canvas.style.height = `${cssHeight}px`

        const transform =
          outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined

        const renderTask = pdfPage.render({
          canvas,
          viewport,
          ...(transform ? { transform } : {}),
        })
        renderTaskRef.current = renderTask
        await renderTask.promise
        if (!cancelled) renderTaskRef.current = null
      } catch (err) {
        const name = err instanceof Error ? err.name : ''
        if (name === 'RenderingCancelledException' || cancelled) return
      }
    }

    void run()

    return () => {
      cancelled = true
      const task = renderTaskRef.current
      renderTaskRef.current = null
      if (task) {
        try {
          task.cancel()
        } catch {
          // ignore
        }
      }
    }
  }, [active, pdf, pageNumber, zoom, containerWidth])

  const available = Math.max(containerWidth - 16, 40)
  const placeholderHeight = slotHeight ?? Math.floor(available * DEFAULT_PAGE_ASPECT * zoom)

  return (
    <div
      ref={wrapRef}
      data-page={pageNumber}
      className={className}
      style={{ minHeight: placeholderHeight }}
    >
      {active ? <canvas ref={canvasRef} className={canvasClassName} /> : null}
    </div>
  )
}

export default function PdfPreviewViewer({ url, panelVisible = true }: Props) {
  const s = useStyles()
  const [phase, setPhase] = useState<LoadPhase>('idle')
  const [pageCount, setPageCount] = useState(0)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [outline, setOutline] = useState<OutlineNode[]>([])
  const [containerWidth, setContainerWidth] = useState(0)
  const [activePages, setActivePages] = useState<Set<number>>(() => new Set([1]))

  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null)
  const pageAreaRef = useRef<HTMLDivElement | null>(null)
  const pageElsRef = useRef<Map<number, HTMLDivElement>>(new Map())
  const visiblePagesRef = useRef<Set<number>>(new Set())
  const pageRef = useRef(page)
  const scrollingToPageRef = useRef<number | null>(null)
  const scrollRafRef = useRef(0)
  const observerRef = useRef<IntersectionObserver | null>(null)

  pageRef.current = page

  const destroyDoc = useCallback(() => {
    pdfRef.current = null
    const task = loadingTaskRef.current
    loadingTaskRef.current = null
    if (task) {
      void task.destroy().catch(() => {})
    }
  }, [])

  const recomputeActivePages = useCallback((pageCountValue: number) => {
    const next = new Set<number>()
    const seed = new Set(visiblePagesRef.current)
    const current = pageRef.current
    seed.add(current)
    for (const p of seed) {
      for (let d = -1; d <= 1; d++) {
        const n = p + d
        if (n >= 1 && n <= pageCountValue) next.add(n)
      }
    }
    if (next.size === 0 && pageCountValue > 0) next.add(1)
    setActivePages((prev) => {
      if (prev.size === next.size) {
        let same = true
        for (const n of next) {
          if (!prev.has(n)) {
            same = false
            break
          }
        }
        if (same) return prev
      }
      return next
    })
  }, [])

  const registerPageEl = useCallback((pageNumber: number, el: HTMLDivElement | null) => {
    const prev = pageElsRef.current.get(pageNumber)
    if (prev && observerRef.current) {
      try {
        observerRef.current.unobserve(prev)
      } catch {
        // ignore
      }
    }
    if (el) {
      pageElsRef.current.set(pageNumber, el)
      observerRef.current?.observe(el)
    } else {
      pageElsRef.current.delete(pageNumber)
    }
  }, [])

  const scrollToPage = useCallback((target: number) => {
    const el = pageElsRef.current.get(target)
    if (!el) {
      setPage(target)
      return
    }
    scrollingToPageRef.current = target
    setPage(target)
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.setTimeout(() => {
      if (scrollingToPageRef.current === target) {
        scrollingToPageRef.current = null
      }
    }, 400)
  }, [])

  const updatePageFromScroll = useCallback(() => {
    if (scrollingToPageRef.current != null) return
    const area = pageAreaRef.current
    if (!area || pageCount <= 0) return
    const areaRect = area.getBoundingClientRect()
    const areaMid = (areaRect.top + areaRect.bottom) / 2
    let best = pageRef.current
    let bestDist = Infinity
    for (let n = 1; n <= pageCount; n++) {
      const el = pageElsRef.current.get(n)
      if (!el) continue
      const rect = el.getBoundingClientRect()
      const mid = (rect.top + rect.bottom) / 2
      const dist = Math.abs(mid - areaMid)
      if (dist < bestDist) {
        bestDist = dist
        best = n
      }
    }
    if (best !== pageRef.current) setPage(best)
  }, [pageCount])

  useEffect(() => {
    if (!panelVisible || !url) {
      destroyDoc()
      setPhase('idle')
      setPageCount(0)
      setPage(1)
      setOutline([])
      setOutlineOpen(false)
      setZoom(1)
      setActivePages(new Set([1]))
      visiblePagesRef.current = new Set()
      return
    }

    let cancelled = false
    destroyDoc()
    setPhase('loading')
    setPage(1)
    setZoom(1)
    setOutlineOpen(false)
    setOutline([])
    setActivePages(new Set([1]))
    visiblePagesRef.current = new Set()

    const task = getDocument({ url, withCredentials: false })
    loadingTaskRef.current = task

    void task.promise
      .then(async (pdf) => {
        if (cancelled) {
          await task.destroy().catch(() => {})
          return
        }
        pdfRef.current = pdf
        setPageCount(pdf.numPages)
        try {
          const rawOutline = await pdf.getOutline()
          if (!cancelled) setOutline(mapOutline(rawOutline))
        } catch {
          if (!cancelled) setOutline([])
        }
        if (!cancelled) setPhase('ready')
      })
      .catch(() => {
        if (!cancelled) {
          pdfRef.current = null
          loadingTaskRef.current = null
          setPhase('failed')
        }
      })

    return () => {
      cancelled = true
      destroyDoc()
    }
  }, [url, panelVisible, destroyDoc])

  useEffect(() => {
    if (phase !== 'ready') return
    const area = pageAreaRef.current
    if (!area) return

    const measure = () => {
      setContainerWidth(area.clientWidth)
    }
    measure()

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(measure)
      : null
    resizeObserver?.observe(area)

    const onScroll = () => {
      if (scrollRafRef.current) return
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = 0
        updatePageFromScroll()
        recomputeActivePages(pageCount)
      })
    }
    area.addEventListener('scroll', onScroll, { passive: true })

    // Chromium/Electron：触控板捏合会以 ctrlKey + wheel 上报；拦截以免整窗缩放
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const factor = Math.exp(-e.deltaY * 0.01)
      setZoom((z) => {
        const next = Math.round(z * factor * 100) / 100
        return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))
      })
    }
    area.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      resizeObserver?.disconnect()
      area.removeEventListener('scroll', onScroll)
      area.removeEventListener('wheel', onWheel)
      if (scrollRafRef.current) {
        window.cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = 0
      }
    }
  }, [phase, pageCount, updatePageFromScroll, recomputeActivePages])

  useEffect(() => {
    if (phase !== 'ready' || pageCount <= 0) return
    const area = pageAreaRef.current
    if (!area) return

    const observer = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const raw = (entry.target as HTMLElement).dataset.page
            const n = raw ? Number(raw) : NaN
            if (!Number.isFinite(n)) continue
            if (entry.isIntersecting) visiblePagesRef.current.add(n)
            else visiblePagesRef.current.delete(n)
          }
          recomputeActivePages(pageCount)
          updatePageFromScroll()
        },
        { root: area, rootMargin: '240px 0px', threshold: 0 },
      )
      : null

    observerRef.current = observer
    for (const el of pageElsRef.current.values()) {
      observer?.observe(el)
    }
    recomputeActivePages(pageCount)

    return () => {
      observerRef.current = null
      observer?.disconnect()
    }
  }, [phase, pageCount, recomputeActivePages, updatePageFromScroll])

  useEffect(() => {
    if (phase === 'ready' && pageCount > 0) {
      recomputeActivePages(pageCount)
    }
  }, [phase, pageCount, page, recomputeActivePages])

  const goPrev = () => {
    if (page <= 1) return
    scrollToPage(page - 1)
  }
  const goNext = () => {
    if (page >= pageCount) return
    scrollToPage(page + 1)
  }
  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, Math.round(z * ZOOM_STEP * 100) / 100))
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, Math.round(z / ZOOM_STEP * 100) / 100))
  const fitWidth = () => setZoom(1)

  const onOutlineNavigate = useCallback(async (node: OutlineNode) => {
    const pdf = pdfRef.current
    if (!pdf) return
    try {
      const target = await resolveDestPage(pdf, node.dest)
      if (target != null && target >= 1 && target <= pdf.numPages) {
        scrollToPage(target)
      }
    } catch {
      // ignore bad outline destinations
    }
  }, [scrollToPage])

  if (!panelVisible) {
    return <div className={s.root} aria-hidden />
  }

  if (phase === 'loading' || phase === 'idle') {
    return (
      <div className={s.root}>
        <div className={s.status}>
          <Spinner size="small" label={LOADING_LABEL} />
        </div>
      </div>
    )
  }

  if (phase === 'failed') {
    return (
      <div className={s.root}>
        <div className={s.status}>{FAIL_MESSAGE}</div>
      </div>
    )
  }

  const pdf = pdfRef.current
  const hasOutline = outline.length > 0
  const outlineToggleLabel = hasOutline
    ? (outlineOpen ? '收起目录' : '打开目录')
    : (outlineOpen ? '收起页码目录' : '打开页码目录')

  return (
    <div className={s.root}>
      <div className={s.toolbar} role="toolbar" aria-label="文档预览">
        <button
          type="button"
          className={s.toolBtn}
          onClick={goPrev}
          disabled={page <= 1}
          aria-label="上一页"
          title="上一页"
        >
          <ChevronLeftRegular fontSize={16} />
        </button>
        <span className={s.pageLabel}>
          {page}
          {' / '}
          {pageCount}
        </span>
        <button
          type="button"
          className={s.toolBtn}
          onClick={goNext}
          disabled={page >= pageCount}
          aria-label="下一页"
          title="下一页"
        >
          <ChevronRightRegular fontSize={16} />
        </button>
        <span className={s.spacer} />
        <button
          type="button"
          className={s.toolBtn}
          onClick={zoomOut}
          disabled={zoom <= ZOOM_MIN}
          aria-label="缩小"
          title="缩小"
        >
          <ZoomOutRegular fontSize={16} />
        </button>
        <button
          type="button"
          className={s.toolBtn}
          onClick={fitWidth}
          aria-label="适合宽度"
          title="适合宽度"
        >
          <ArrowFitRegular fontSize={16} />
        </button>
        <button
          type="button"
          className={s.toolBtn}
          onClick={zoomIn}
          disabled={zoom >= ZOOM_MAX}
          aria-label="放大"
          title="放大"
        >
          <ZoomInRegular fontSize={16} />
        </button>
        <button
          type="button"
          className={mergeClasses(s.toolBtn, outlineOpen && s.toolBtnActive)}
          onClick={() => setOutlineOpen((v) => !v)}
          aria-label={outlineToggleLabel}
          title={outlineToggleLabel}
          aria-pressed={outlineOpen}
        >
          <TextBulletListTreeRegular fontSize={16} />
        </button>
      </div>
      <div className={s.main}>
        {outlineOpen ? (
          <nav className={s.outline} aria-label={hasOutline ? '文档目录' : '页码目录'}>
            {hasOutline ? (
              <OutlineTree
                nodes={outline}
                depth={0}
                onNavigate={(node) => { void onOutlineNavigate(node) }}
                className={s.outlineItem}
              />
            ) : (
              Array.from({ length: pageCount }, (_, i) => {
                const n = i + 1
                return (
                  <button
                    key={n}
                    type="button"
                    className={s.outlineItem}
                    title={`第 ${n} 页`}
                    onClick={() => scrollToPage(n)}
                  >
                    {`第 ${n} 页`}
                  </button>
                )
              })
            )}
          </nav>
        ) : null}
        <div className={s.pageArea} ref={pageAreaRef}>
          <div className={s.pagesColumn}>
            {pdf
              ? Array.from({ length: pageCount }, (_, i) => {
                const pageNumber = i + 1
                return (
                  <PdfPageSlot
                    key={pageNumber}
                    pdf={pdf}
                    pageNumber={pageNumber}
                    zoom={zoom}
                    containerWidth={containerWidth}
                    active={activePages.has(pageNumber)}
                    className={s.pageSlot}
                    canvasClassName={s.canvas}
                    onRegister={registerPageEl}
                  />
                )
              })
              : null}
          </div>
        </div>
      </div>
    </div>
  )
}
