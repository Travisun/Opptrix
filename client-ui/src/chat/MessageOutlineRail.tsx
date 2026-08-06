import {
  useCallback, useEffect, useMemo, useRef, useState,
  type RefObject,
} from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import type { ChatDisplayMessage } from '../types/chat'
import { opptrixCssVars } from '../theme/tokens'
import { motion } from '../theme/mixins'
import { formatFriendlyTime } from '../utils/formatFriendlyTime'

export interface OutlineEntry {
  index: number
  role: 'assistant'
  summary: string
  /** ISO timestamp from ChatDisplayMessage.at; empty when missing/invalid. */
  at: string
}

/** 仅收录助手有正文的消息；user / 空正文不进目录轨。 */
export function buildOutlineEntries(messages: ChatDisplayMessage[]): OutlineEntry[] {
  const out: OutlineEntry[] = []
  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i]
    if (m.role !== 'assistant') continue
    const text = m.content.trim()
    if (!text) continue
    out.push({
      index: i,
      role: 'assistant',
      summary: text.length > 80 ? `${text.slice(0, 80)}…` : text,
      at: typeof m.at === 'string' ? m.at : '',
    })
  }
  return out
}

/** Map outline ordinal → vertical position on the rail (0–100). */
function ordinalTopPercent(ordinal: number, count: number): number {
  if (count <= 1) return 50
  return (ordinal / (count - 1)) * 100
}

const useStyles = makeStyles({
  rail: {
    position: 'absolute',
    left: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 4,
    width: '22px',
    height: 'min(56vh, 420px)',
    boxSizing: 'border-box',
    overflow: 'visible',
    pointerEvents: 'auto',
  },
  track: {
    position: 'relative',
    width: '2px',
    height: '100%',
    marginInline: 'auto',
    borderRadius: '1px',
    /** Idle: solid light gray (no opacity); deepens on rail hover/focus. */
    backgroundColor: opptrixCssVars.gray100,
    overflow: 'visible',
    transitionProperty: 'background-color',
    transitionDuration: motion.fast,
    transitionTimingFunction: motion.ease,
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '1ms',
    },
  },
  trackRailHover: {
    backgroundColor: opptrixCssVars.textSecondary,
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    borderRadius: '1px',
    backgroundColor: opptrixCssVars.gray100,
    transitionProperty: 'height, background-color',
    transitionDuration: motion.fast,
    transitionTimingFunction: motion.ease,
    pointerEvents: 'none',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '1ms',
    },
  },
  trackFillRailHover: {
    backgroundColor: opptrixCssVars.textPrimary,
  },
  item: {
    position: 'absolute',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    padding: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    outline: 'none',
    zIndex: 1,
    transitionProperty: 'width, height',
    transitionDuration: motion.fast,
    transitionTimingFunction: motion.ease,
    ':focus-visible > span:first-child': {
      outline: `2px solid ${opptrixCssVars.textPrimary}`,
      outlineOffset: '2px',
    },
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '1ms',
    },
  },
  itemRailHover: {
    width: '28px',
    height: '28px',
  },
  dot: {
    width: '3px',
    height: '3px',
    borderRadius: '50%',
    backgroundColor: opptrixCssVars.gray100,
    transform: 'scale(1)',
    transitionProperty: 'transform, width, height, background-color',
    transitionDuration: motion.fast,
    transitionTimingFunction: motion.ease,
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '1ms',
    },
  },
  /** Mild grow for non-hot dots while rail is hovered/focused. */
  dotRailHover: {
    width: '6px',
    height: '6px',
    backgroundColor: opptrixCssVars.textSecondary,
  },
  /** Active while rail idle — same light gray; +1px only. */
  dotActive: {
    width: '4px',
    height: '4px',
    backgroundColor: opptrixCssVars.gray100,
    transform: 'scale(1.05)',
  },
  /** Active after rail hover/focus — primary + slightly larger than peers. */
  dotActiveRailHover: {
    width: '7px',
    height: '7px',
    backgroundColor: opptrixCssVars.textPrimary,
  },
  /** Hover/focus target — largest; wins over active/railHover. */
  dotHot: {
    width: '11px',
    height: '11px',
    transform: 'scale(1.1)',
    backgroundColor: opptrixCssVars.textPrimary,
  },
  preview: {
    position: 'absolute',
    left: '24px',
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 6,
    width: '220px',
    padding: '8px 10px',
    boxSizing: 'border-box',
    borderRadius: '8px',
    backgroundColor: opptrixCssVars.surface,
    border: `1px solid ${opptrixCssVars.separator}`,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
    pointerEvents: 'none',
    textAlign: 'left',
  },
  previewMeta: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '8px',
    marginBottom: '4px',
  },
  previewRole: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textSecondary,
    flexShrink: 0,
  },
  previewTime: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 400,
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
  },
  previewText: {
    display: 'block',
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.45,
    color: opptrixCssVars.textPrimary,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
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
  const entries = useMemo(() => buildOutlineEntries(messages), [messages])
  const [activeIndex, setActiveIndex] = useState(() => entries[0]?.index ?? -1)
  const [previewOrdinal, setPreviewOrdinal] = useState<number | null>(null)
  const [railHovered, setRailHovered] = useState(false)

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

  const activeOrdinal = useMemo(
    () => entries.findIndex(e => e.index === activeIndex),
    [entries, activeIndex],
  )

  const progressPct = useMemo(() => {
    if (entries.length === 0 || activeOrdinal < 0) return 0
    return ordinalTopPercent(activeOrdinal, entries.length)
  }, [entries.length, activeOrdinal])

  if (entries.length === 0) return null

  /** True when pointer is over the rail or focus is within it. */
  const engageRail = () => setRailHovered(true)
  const disengageRailIfLeaving = (related: EventTarget | null) => {
    if (!railRef.current?.contains(related as Node | null)) {
      setPreviewOrdinal(null)
      setRailHovered(false)
    }
  }

  return (
    <div
      ref={railRef}
      className={s.rail}
      role="navigation"
      aria-label="消息目录"
      onMouseEnter={engageRail}
      onMouseLeave={() => {
        // Keep engaged while a node inside the rail still has keyboard focus.
        if (railRef.current?.contains(document.activeElement)) return
        setRailHovered(false)
        setPreviewOrdinal(null)
      }}
      onFocus={engageRail}
      onBlur={e => disengageRailIfLeaving(e.relatedTarget)}
    >
      <div className={mergeClasses(s.track, railHovered && s.trackRailHover)}>
        <div
          className={mergeClasses(s.trackFill, railHovered && s.trackFillRailHover)}
          style={{ height: `${progressPct}%` }}
          aria-hidden
        />
        {entries.map((entry, ordinal) => {
          const isActive = entry.index === activeIndex
          const isHot = previewOrdinal === ordinal
          const topPct = ordinalTopPercent(ordinal, entries.length)
          const timeLabel = entry.at ? formatFriendlyTime(entry.at) : ''
          return (
            <button
              key={entry.index}
              type="button"
              className={mergeClasses(s.item, railHovered && s.itemRailHover)}
              style={{ top: `${topPct}%` }}
              aria-label="跳到助手的消息"
              aria-current={isActive ? 'true' : undefined}
              onMouseEnter={() => setPreviewOrdinal(ordinal)}
              onMouseLeave={() => setPreviewOrdinal(null)}
              onFocus={() => setPreviewOrdinal(ordinal)}
              onClick={() => {
                setActiveIndex(entry.index)
                onJump(entry.index)
              }}
            >
              <span
                className={mergeClasses(
                  s.dot,
                  railHovered && !isHot && s.dotRailHover,
                  isActive && !isHot && !railHovered && s.dotActive,
                  isActive && !isHot && railHovered && s.dotActiveRailHover,
                  isHot && s.dotHot,
                )}
              />
              {isHot ? (
                <span className={s.preview} role="tooltip">
                  <span className={s.previewMeta}>
                    <span className={s.previewRole}>助手</span>
                    {timeLabel ? (
                      <span className={s.previewTime}>{timeLabel}</span>
                    ) : null}
                  </span>
                  <span className={s.previewText}>{entry.summary}</span>
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
