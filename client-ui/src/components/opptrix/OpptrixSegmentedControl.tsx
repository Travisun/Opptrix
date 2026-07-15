import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { focusVisibleRing, motion } from '../../theme/mixins'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'

const SEGMENTED_INSET = 2
const SEGMENT_HEIGHT = 26

const useStyles = makeStyles({
  track: {
    position: 'relative',
    display: 'flex',
    alignItems: 'stretch',
    width: '100%',
    boxSizing: 'border-box',
    padding: `${SEGMENTED_INSET}px`,
    borderRadius: opptrixTokens.radiusFull,
    flexShrink: 0,
    isolation: 'isolate',
  },
  trackEmbedded: {
    borderRadius: opptrixTokens.radiusMd,
  },
  thumb: {
    position: 'absolute',
    top: `${SEGMENTED_INSET}px`,
    left: 0,
    height: `${SEGMENT_HEIGHT}px`,
    borderRadius: opptrixTokens.radiusFull,
    pointerEvents: 'none',
    zIndex: 0,
    willChange: 'transform, width',
    transitionProperty: 'transform, width',
    transitionDuration: motion.normal,
    transitionTimingFunction: 'cubic-bezier(0.35, 1.12, 0.45, 1)',
  },
  thumbEmbedded: {
    borderRadius: opptrixTokens.radiusMd,
  },
  segment: {
    position: 'relative',
    zIndex: 1,
    flex: 1,
    minWidth: 0,
    border: 'none',
    backgroundColor: 'transparent',
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 600,
    lineHeight: 1,
    height: `${SEGMENT_HEIGHT}px`,
    padding: '0 8px',
    borderRadius: opptrixTokens.radiusFull,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transitionProperty: 'color, opacity',
    transitionDuration: motion.fast,
    transitionTimingFunction: motion.ease,
    ...focusVisibleRing,
    ':hover': {
      color: opptrixCssVars.textPrimary,
    },
    ':active': {
      opacity: opptrixTokens.activeOpacity,
    },
  },
  segmentEmbedded: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 500,
    borderRadius: opptrixTokens.radiusMd,
  },
  segmentActive: {
    color: opptrixCssVars.textPrimary,
  },
})

export type SegmentedOption<T extends string> = {
  value: T
  label: ReactNode
}

interface OpptrixSegmentedControlProps<T extends string> {
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  className?: string
  variant?: 'default' | 'embedded'
  'aria-label'?: string
}

export default function OpptrixSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
  variant = 'default',
  'aria-label': ariaLabel,
}: OpptrixSegmentedControlProps<T>) {
  const s = useStyles()
  const embedded = variant === 'embedded'
  const trackRef = useRef<HTMLDivElement>(null)
  const segmentRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [thumb, setThumb] = useState({ x: 0, width: 0, ready: false })

  const activeIndex = Math.max(0, options.findIndex(opt => opt.value === value))

  const measureThumb = useCallback(() => {
    const track = trackRef.current
    const btn = segmentRefs.current[activeIndex]
    if (!track || !btn) return
    setThumb({
      x: btn.offsetLeft,
      width: btn.offsetWidth,
      ready: true,
    })
  }, [activeIndex])

  useLayoutEffect(() => {
    measureThumb()
    const track = trackRef.current
    if (!track || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => measureThumb())
    ro.observe(track)
    for (const btn of segmentRefs.current) {
      if (btn) ro.observe(btn)
    }
    return () => ro.disconnect()
  }, [measureThumb, options.length, value])

  return (
    <div
      ref={trackRef}
      className={mergeClasses(
        s.track,
        'opptrix-segmented-control',
        embedded && s.trackEmbedded,
        embedded && 'opptrix-segmented-control-embedded',
        className,
      )}
      role="tablist"
      aria-label={ariaLabel}
    >
      <div
        className={mergeClasses(
          s.thumb,
          'opptrix-segmented-thumb',
          embedded && s.thumbEmbedded,
          embedded && 'opptrix-segmented-thumb-embedded',
        )}
        aria-hidden
        style={{
          width: thumb.width || undefined,
          transform: `translateX(${thumb.x}px)`,
          opacity: thumb.ready ? 1 : 0,
        }}
      />
      {options.map((opt, index) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            ref={el => { segmentRefs.current[index] = el }}
            type="button"
            role="tab"
            aria-selected={active}
            className={mergeClasses(
              s.segment,
              embedded && s.segmentEmbedded,
              active && s.segmentActive,
              'opptrix-focusable',
            )}
            onClick={() => {
              if (opt.value !== value) onChange(opt.value)
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
