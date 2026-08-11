import {
  useCallback, useEffect, useMemo, useRef, useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import type { ChatAttachmentMeta, ChatDisplayMessage, MediaKind } from '../types/chat'
import { opptrixCssVars } from '../theme/tokens'
import { motion } from '../theme/mixins'
import { formatFriendlyTime } from '../utils/formatFriendlyTime'
import MarkdownMessage from './MarkdownMessage'
import {
  buildOutlineSummary,
  buildPreviewMarkdown,
} from './messageOutlinePreview'

export {
  buildOutlineSummary,
  buildPreviewMarkdown,
  stripChartFencesForPreview,
  CHART_PREVIEW_PLACEHOLDER,
} from './messageOutlinePreview'

/** Attachments that count as a report / produced artifact for the outline tip. */
const REPORT_KINDS = new Set<MediaKind>(['pdf', 'document', 'canvas', 'mindmap'])

/** Center-to-center pitch of outline dots (compact index cluster). */
export const DOT_PITCH_PX = 18

/** Viewport cap for the compact cluster (matches CSS maxHeight). */
export function maxRailHeightPx(vh = typeof window !== 'undefined' ? window.innerHeight : 800): number {
  return Math.min(vh * 0.56, 420)
}

/** Total column height for N dots at fixed pitch. */
export function clusterContentHeight(count: number, pitchPx = DOT_PITCH_PX): number {
  return Math.max(0, count) * pitchPx
}

/**
 * Window translate for an overflowing compact cluster.
 * Keeps `anchorOrdinal` centered in the viewport; clamps to content edges.
 */
export function clusterTranslateY(
  anchorOrdinal: number,
  count: number,
  viewportHeight: number,
  pitchPx = DOT_PITCH_PX,
): number {
  const contentHeight = clusterContentHeight(count, pitchPx)
  if (count <= 0 || contentHeight <= viewportHeight) return 0
  const clampedAnchor = Math.min(count - 1, Math.max(0, anchorOrdinal))
  const anchorCenter = (clampedAnchor + 0.5) * pitchPx
  const desired = viewportHeight / 2 - anchorCenter
  const minT = viewportHeight - contentHeight
  return Math.min(0, Math.max(minT, desired))
}

export interface OutlineEntry {
  index: number
  role: 'assistant'
  /** Plain one-line fallback (aria / reduced contexts). */
  summary: string
  /** Truncated markdown for tooltip preview. */
  previewMarkdown: string
  /** True when the message has a report/document/canvas/mindmap attachment. */
  hasReport: boolean
  /** ISO timestamp from ChatDisplayMessage.at; empty when missing/invalid. */
  at: string
}

export function messageHasReport(attachments: ChatAttachmentMeta[] | undefined): boolean {
  if (!attachments?.length) return false
  return attachments.some(a => REPORT_KINDS.has(a.kind))
}

/**
 * Fisheye scale by ordinal distance from focus.
 * scale = base + amp * exp(-dist² / (2·σ²))
 */
export function fisheyeScale(
  dist: number,
  opts?: { base?: number; amp?: number; sigma?: number },
): number {
  const base = opts?.base ?? 1
  const amp = opts?.amp ?? 0.85
  const sigma = opts?.sigma ?? 1.35
  return base + amp * Math.exp(-(dist * dist) / (2 * sigma * sigma))
}

/**
 * Map pointer Y to outline ordinal using compact-cluster geometry
 * (fixed pitch + current window translate), not full-rail percent spread.
 */
export function clientYToOrdinal(
  clientY: number,
  railTop: number,
  count: number,
  translateY: number,
  pitchPx = DOT_PITCH_PX,
): number {
  if (count <= 1) return 0
  if (pitchPx <= 0) return 0
  const yInContent = clientY - railTop - translateY
  const ordinal = Math.floor(yInContent / pitchPx)
  return Math.min(count - 1, Math.max(0, ordinal))
}

/** 仅收录助手有正文的消息；user / 空正文不进目录轨。 */
export function buildOutlineEntries(messages: ChatDisplayMessage[]): OutlineEntry[] {
  const out: OutlineEntry[] = []
  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i]
    if (m.role !== 'assistant') continue
    const text = m.content.trim()
    if (!text) continue
    const previewMarkdown = buildPreviewMarkdown(text)
    out.push({
      index: i,
      role: 'assistant',
      summary: buildOutlineSummary(text),
      previewMarkdown,
      hasReport: messageHasReport(m.attachments),
      at: typeof m.at === 'string' ? m.at : '',
    })
  }
  return out
}

const useStyles = makeStyles({
  rail: {
    position: 'absolute',
    left: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 4,
    width: '28px',
    height: 'auto',
    maxHeight: 'min(56vh, 420px)',
    boxSizing: 'border-box',
    overflow: 'visible',
    pointerEvents: 'auto',
    cursor: 'ns-resize',
    touchAction: 'none',
  },
  /** Clips the compact column when taller than the viewport. */
  clip: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  /** Compact vertical index cluster — fixed pitch, no percent spread. */
  column: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    pointerEvents: 'auto',
    willChange: 'transform',
  },
  item: {
    position: 'relative',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: `${DOT_PITCH_PX}px`,
    padding: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    outline: 'none',
    zIndex: 1,
    ':focus-visible > span:first-child': {
      outline: `2px solid ${opptrixCssVars.textPrimary}`,
      outlineOffset: '2px',
    },
  },
  dot: {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    backgroundColor: opptrixCssVars.gray100,
    transform: 'scale(1)',
    transformOrigin: 'center center',
    transitionProperty: 'transform, background-color',
    transitionDuration: motion.fast,
    transitionTimingFunction: motion.ease,
    pointerEvents: 'none',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '1ms',
    },
  },
  dotRailHover: {
    backgroundColor: opptrixCssVars.textSecondary,
  },
  dotActive: {
    backgroundColor: opptrixCssVars.textSecondary,
  },
  dotActiveRailHover: {
    backgroundColor: opptrixCssVars.textPrimary,
  },
  preview: {
    position: 'absolute',
    left: '26px',
    zIndex: 6,
    width: '240px',
    maxHeight: '220px',
    padding: '8px 10px',
    boxSizing: 'border-box',
    borderRadius: '8px',
    backgroundColor: opptrixCssVars.surface,
    border: `1px solid ${opptrixCssVars.separator}`,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
    pointerEvents: 'none',
    textAlign: 'left',
    overflow: 'hidden',
    opacity: 1,
    transform: 'translateY(-50%) translateX(0)',
    transitionProperty: 'opacity, transform',
    transitionDuration: motion.fast,
    transitionTimingFunction: motion.easeOut,
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '1ms',
      transform: 'translateY(-50%)',
    },
  },
  previewEnter: {
    animationName: {
      from: {
        opacity: 0,
        transform: 'translateY(-50%) translateX(-4px)',
      },
      to: {
        opacity: 1,
        transform: 'translateY(-50%) translateX(0)',
      },
    },
    animationDuration: motion.fast,
    animationTimingFunction: motion.easeOut,
    animationFillMode: 'both',
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
      animationDuration: '1ms',
    },
  },
  previewMeta: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '8px',
    marginBottom: '6px',
  },
  previewTime: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 500,
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
  },
  previewBadge: {
    flexShrink: 0,
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    letterSpacing: '0.02em',
    color: opptrixCssVars.textPrimary,
    backgroundColor: opptrixCssVars.surfaceMuted,
    borderRadius: '4px',
    padding: '1px 6px',
    lineHeight: 1.4,
  },
  previewMd: {
    display: 'block',
    maxHeight: '160px',
    overflow: 'hidden',
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.4,
    color: opptrixCssVars.textPrimary,
    wordBreak: 'break-word',
    '& p': {
      marginTop: 0,
      marginBottom: '0.35em',
    },
    '& p:last-child': {
      marginBottom: 0,
    },
    '& h1, & h2, & h3, & h4, & h5, & h6': {
      fontSize: 'var(--opptrix-font-sm)',
      fontWeight: 600,
      marginTop: 0,
      marginBottom: '0.3em',
      lineHeight: 1.35,
    },
    '& ul, & ol': {
      marginTop: 0,
      marginBottom: '0.35em',
      paddingLeft: '1.1em',
    },
    '& code': {
      fontSize: '0.92em',
    },
    '& pre': {
      margin: '0.25em 0',
      padding: '4px 6px',
      fontSize: '0.85em',
      maxHeight: '64px',
      overflow: 'hidden',
    },
    '& img, & table': {
      display: 'none',
    },
    /* Defense-in-depth: chart/mermaid must not paint in the narrow tip. */
    '& .opptrix-md-chart, & .opptrix-md-mermaid': {
      display: 'none',
    },
  },
})

interface Props {
  messages: ChatDisplayMessage[]
  scrollContainerRef: RefObject<HTMLElement | null>
  onJump: (messageIndex: number) => void
}

export default function MessageOutlineRail({
  messages,
  scrollContainerRef,
  onJump,
}: Props) {
  const s = useStyles()
  const railRef = useRef<HTMLDivElement>(null)
  const scrubbingRef = useRef(false)
  const lastJumpOrdinalRef = useRef(-1)
  const translateYRef = useRef(0)
  const entries = useMemo(() => buildOutlineEntries(messages), [messages])
  const [activeIndex, setActiveIndex] = useState(() => entries[0]?.index ?? -1)
  /** Fisheye / tooltip focus ordinal; null when rail idle. */
  const [focusOrdinal, setFocusOrdinal] = useState<number | null>(null)
  const [railHovered, setRailHovered] = useState(false)
  const [tooltipOrdinal, setTooltipOrdinal] = useState<number | null>(null)
  const [maxRailPx, setMaxRailPx] = useState(() => maxRailHeightPx())
  /** Freeze window while scrubbing so edge drags don't pan under the pointer. */
  const [scrubTranslateY, setScrubTranslateY] = useState<number | null>(null)

  useEffect(() => {
    const onResize = () => setMaxRailPx(maxRailHeightPx())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (entries.length === 0) {
      setActiveIndex(-1)
      return
    }
    if (!entries.some(e => e.index === activeIndex)) {
      setActiveIndex(entries[0].index)
    }
  }, [entries, activeIndex])

  const syncActiveFromScroll = useCallback(() => {
    if (scrubbingRef.current) return
    const container = scrollContainerRef.current
    if (!container || entries.length === 0) return
    const rect = container.getBoundingClientRect()
    const pivot = rect.top + Math.min(rect.height * 0.32, 120)
    let best = entries[0].index
    let bestDist = Number.POSITIVE_INFINITY
    for (const entry of entries) {
      const el = container.querySelector(`[data-message-index="${entry.index}"]`)
      if (!(el instanceof HTMLElement)) continue
      const er = el.getBoundingClientRect()
      const mid = er.top + Math.min(er.height * 0.25, 40)
      const dist = Math.abs(mid - pivot)
      if (dist < bestDist) {
        bestDist = dist
        best = entry.index
      }
    }
    setActiveIndex(best)
  }, [entries, scrollContainerRef])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || entries.length === 0) return
    syncActiveFromScroll()
    container.addEventListener('scroll', syncActiveFromScroll, { passive: true })
    return () => container.removeEventListener('scroll', syncActiveFromScroll)
  }, [entries.length, scrollContainerRef, syncActiveFromScroll])

  const jumpToOrdinal = useCallback((ordinal: number) => {
    const entry = entries[ordinal]
    if (!entry) return
    setActiveIndex(entry.index)
    setFocusOrdinal(ordinal)
    if (lastJumpOrdinalRef.current === ordinal) return
    lastJumpOrdinalRef.current = ordinal
    onJump(entry.index)
  }, [entries, onJump])

  const contentHeight = clusterContentHeight(entries.length)
  const viewportHeight = Math.min(contentHeight, maxRailPx)
  const activeOrd = entries.findIndex(en => en.index === activeIndex)
  // Window follows active (wheel/scroll/jump). Hover focus only drives fisheye.
  const anchorOrdinal = activeOrd >= 0 ? activeOrd : 0
  const liveTranslateY = clusterTranslateY(anchorOrdinal, entries.length, viewportHeight)
  const translateY = scrubTranslateY ?? liveTranslateY
  translateYRef.current = translateY

  const ordinalFromPointer = useCallback((clientY: number) => {
    const el = railRef.current
    if (!el || entries.length === 0) return 0
    const rect = el.getBoundingClientRect()
    return clientYToOrdinal(
      clientY,
      rect.top,
      entries.length,
      translateYRef.current,
      DOT_PITCH_PX,
    )
  }, [entries.length])

  const engageRail = () => setRailHovered(true)
  const disengageRailIfLeaving = (related: EventTarget | null) => {
    if (scrubbingRef.current) return
    if (!railRef.current?.contains(related as Node | null)) {
      setFocusOrdinal(null)
      setTooltipOrdinal(null)
      setRailHovered(false)
    }
  }

  const onRailPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    scrubbingRef.current = true
    lastJumpOrdinalRef.current = -1
    e.currentTarget.setPointerCapture(e.pointerId)
    setRailHovered(true)
    setScrubTranslateY(translateYRef.current)
    const ordinal = ordinalFromPointer(e.clientY)
    setTooltipOrdinal(ordinal)
    jumpToOrdinal(ordinal)
  }

  const onRailPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const ordinal = ordinalFromPointer(e.clientY)
    if (scrubbingRef.current) {
      setTooltipOrdinal(ordinal)
      jumpToOrdinal(ordinal)
      return
    }
    if (railHovered) {
      setFocusOrdinal(ordinal)
    }
  }

  const endScrub = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return
    scrubbingRef.current = false
    lastJumpOrdinalRef.current = -1
    setScrubTranslateY(null)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const onRailWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    if (entries.length <= 1) return
    e.preventDefault()
    const base = focusOrdinal ?? (activeOrd >= 0 ? activeOrd : 0)
    const delta = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0
    if (delta === 0) return
    const next = Math.min(entries.length - 1, Math.max(0, base + delta))
    setRailHovered(true)
    setTooltipOrdinal(next)
    jumpToOrdinal(next)
  }

  if (entries.length === 0) return null

  const fisheyeBase = railHovered ? 1.15 : 1
  const fisheyeAmp = railHovered ? 0.95 : 0
  const focusForScale = focusOrdinal
  const tipEntry = tooltipOrdinal != null ? entries[tooltipOrdinal] : null
  const tipTopPx = tipEntry != null && tooltipOrdinal != null
    ? (tooltipOrdinal + 0.5) * DOT_PITCH_PX + translateY
    : 0
  const tipTimeLabel = tipEntry?.at ? formatFriendlyTime(tipEntry.at) : ''

  return (
    <div
      ref={railRef}
      className={s.rail}
      style={{ height: viewportHeight }}
      role="navigation"
      aria-label="消息目录"
      onMouseEnter={engageRail}
      onMouseLeave={() => {
        if (scrubbingRef.current) return
        if (railRef.current?.contains(document.activeElement)) return
        setRailHovered(false)
        setFocusOrdinal(null)
        setTooltipOrdinal(null)
      }}
      onFocus={engageRail}
      onBlur={e => disengageRailIfLeaving(e.relatedTarget)}
      onPointerDown={onRailPointerDown}
      onPointerMove={onRailPointerMove}
      onPointerUp={endScrub}
      onPointerCancel={endScrub}
      onWheel={onRailWheel}
    >
      <div className={s.clip}>
        <div
          className={s.column}
          style={{ transform: `translateY(${translateY}px)` }}
        >
          {entries.map((entry, ordinal) => {
            const isActive = entry.index === activeIndex
            const dist = focusForScale == null ? 99 : Math.abs(ordinal - focusForScale)
            const scale = fisheyeScale(dist, {
              base: fisheyeBase * (isActive ? 1.08 : 1),
              amp: fisheyeAmp,
              sigma: 1.35,
            })
            const showTipFocus = tooltipOrdinal === ordinal || focusForScale === ordinal
            const dotColorClass = railHovered
              ? (isActive || showTipFocus ? s.dotActiveRailHover : s.dotRailHover)
              : (isActive ? s.dotActive : undefined)

            return (
              <button
                key={entry.index}
                type="button"
                className={s.item}
                aria-label={
                  entry.hasReport
                    ? '跳到助手的消息（含报告）'
                    : '跳到助手的消息'
                }
                aria-current={isActive ? 'true' : undefined}
                onMouseEnter={() => {
                  setFocusOrdinal(ordinal)
                  setTooltipOrdinal(ordinal)
                }}
                onMouseLeave={() => {
                  if (!scrubbingRef.current) {
                    setTooltipOrdinal(null)
                  }
                }}
                onFocus={() => {
                  setFocusOrdinal(ordinal)
                  setTooltipOrdinal(ordinal)
                }}
                onClick={() => {
                  setActiveIndex(entry.index)
                  setFocusOrdinal(ordinal)
                  onJump(entry.index)
                }}
              >
                <span
                  className={mergeClasses(s.dot, dotColorClass)}
                  style={{ transform: `scale(${scale})` }}
                />
              </button>
            )
          })}
        </div>
      </div>
      {tipEntry != null && tooltipOrdinal != null ? (
        <span
          className={mergeClasses(s.preview, s.previewEnter)}
          style={{ top: tipTopPx }}
          role="tooltip"
        >
          <span className={s.previewMeta}>
            {tipTimeLabel ? (
              <span className={s.previewTime}>{tipTimeLabel}</span>
            ) : (
              <span className={s.previewTime}>助手答复</span>
            )}
            {tipEntry.hasReport ? (
              <span className={s.previewBadge}>含报告</span>
            ) : null}
          </span>
          <MarkdownMessage
            content={tipEntry.previewMarkdown}
            className={s.previewMd}
          />
        </span>
      ) : null}
    </div>
  )
}
