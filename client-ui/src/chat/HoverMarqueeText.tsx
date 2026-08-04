import { useCallback, useEffect, useRef, useState } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'

const MARQUEE_GAP_PX = 28
/** Scroll speed while hovering; duration scales with text length. */
const MARQUEE_PX_PER_SEC = 36

const useStyles = makeStyles({
  root: {
    display: 'block',
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    fontSize: 'inherit',
    fontWeight: 'inherit',
    color: 'inherit',
    lineHeight: 'inherit',
  },
  rootFade: {
    maskImage: 'linear-gradient(to right, #000 calc(100% - 20px), transparent 100%)',
    WebkitMaskImage: 'linear-gradient(to right, #000 calc(100% - 20px), transparent 100%)',
  },
  track: {
    display: 'inline-flex',
    alignItems: 'center',
    width: 'max-content',
    willChange: 'transform',
  },
  segment: {
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  gap: {
    flexShrink: 0,
    width: `${MARQUEE_GAP_PX}px`,
  },
})

type Props = {
  text: string
  className?: string
}

/**
 * Truncated sidebar label: on row hover, scrolls left in a loop until the
 * pointer leaves. Parent row must use `.opptrix-hover-marquee-host` (see global.css).
 */
export default function HoverMarqueeText({ text, className }: Props) {
  const s = useStyles()
  const rootRef = useRef<HTMLSpanElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  const [shiftPx, setShiftPx] = useState(0)

  const measure = useCallback(() => {
    const root = rootRef.current
    const measureEl = measureRef.current
    if (!root || !measureEl) return
    const segment = measureEl.scrollWidth
    const visible = root.clientWidth
    const overflow = segment > visible + 1
    setOverflowing(overflow)
    setShiftPx(overflow ? segment + MARQUEE_GAP_PX : 0)
  }, [])

  useEffect(() => {
    measure()
  }, [measure, text])

  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(root)
    return () => ro.disconnect()
  }, [measure])

  const durationSec = shiftPx > 0
    ? Math.max(2.4, shiftPx / MARQUEE_PX_PER_SEC)
    : 0

  return (
    <span
      ref={rootRef}
      className={mergeClasses(
        s.root,
        overflowing && s.rootFade,
        overflowing && 'opptrix-hover-marquee--overflow',
        'opptrix-hover-marquee',
        className,
      )}
      style={overflowing ? {
        ['--opptrix-marquee-shift' as string]: `${shiftPx}px`,
        ['--opptrix-marquee-duration' as string]: `${durationSec}s`,
      } : undefined}
    >
      <span className={mergeClasses(s.track, 'opptrix-hover-marquee__track')}>
        <span ref={measureRef} className={s.segment}>{text}</span>
        {overflowing && (
          <>
            <span className={s.gap} aria-hidden />
            <span className={s.segment} aria-hidden>{text}</span>
          </>
        )}
      </span>
    </span>
  )
}
