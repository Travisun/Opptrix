import { useCallback, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  FONT_SCALE_LABELS,
  FONT_SCALE_OPTIONS,
  type FontScaleName,
} from '../../theme/fontScale'
import { focusVisibleRing, motion } from '../../theme/mixins'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'

const STEP_COUNT = FONT_SCALE_OPTIONS.length
const MAX_INDEX = STEP_COUNT - 1

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '6px',
    width: '100%',
    maxWidth: '280px',
    minWidth: '168px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
  },
  letter: {
    flexShrink: 0,
    color: opptrixCssVars.textTertiary,
    fontWeight: 500,
    lineHeight: 1,
    userSelect: 'none',
    width: '18px',
    textAlign: 'center',
  },
  letterSm: {
    fontSize: '11px',
  },
  letterLg: {
    fontSize: '20px',
  },
  trackWrap: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    touchAction: 'none',
    cursor: 'pointer',
    borderRadius: opptrixTokens.radiusSm,
    ...focusVisibleRing,
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: '3px',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: opptrixCssVars.separatorStrong,
  },
  ticks: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: '100%',
    pointerEvents: 'none',
  },
  tick: {
    position: 'absolute',
    top: '50%',
    width: '2px',
    height: '8px',
    marginTop: '-4px',
    marginLeft: '-1px',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: opptrixCssVars.separatorStrong,
  },
  thumb: {
    position: 'absolute',
    top: '50%',
    width: '22px',
    height: '22px',
    marginTop: '-11px',
    marginLeft: '-11px',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: opptrixCssVars.canvas,
    border: `1px solid ${opptrixCssVars.separatorStrong}`,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 1px rgba(0, 0, 0, 0.06)',
    transitionProperty: 'left, box-shadow',
    transitionDuration: motion.fast,
    transitionTimingFunction: motion.ease,
    pointerEvents: 'none',
  },
  label: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.3,
    textAlign: 'center',
    minHeight: '16px',
  },
})

function clampIndex(index: number): number {
  if (index < 0) return 0
  if (index > MAX_INDEX) return MAX_INDEX
  return index
}

function indexFromClientX(clientX: number, rect: DOMRect): number {
  if (rect.width <= 0) return 0
  const ratio = (clientX - rect.left) / rect.width
  return clampIndex(Math.round(ratio * MAX_INDEX))
}

export default function FontScaleSlider({
  value,
  onChange,
}: {
  value: FontScaleName
  onChange: (next: FontScaleName) => void
}) {
  const s = useStyles()
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const index = Math.max(0, FONT_SCALE_OPTIONS.indexOf(value))
  const label = FONT_SCALE_LABELS[value]
  const thumbPercent = MAX_INDEX === 0 ? 0 : (index / MAX_INDEX) * 100

  const commitIndex = useCallback((nextIndex: number) => {
    const name = FONT_SCALE_OPTIONS[clampIndex(nextIndex)]
    if (name && name !== value) onChange(name)
  }, [onChange, value])

  const applyFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current
    if (!el) return
    commitIndex(indexFromClientX(clientX, el.getBoundingClientRect()))
  }, [commitIndex])

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    applyFromClientX(e.clientX)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    applyFromClientX(e.clientX)
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    dragging.current = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault()
      commitIndex(index - 1)
      return
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault()
      commitIndex(index + 1)
      return
    }
    if (e.key === 'Home') {
      e.preventDefault()
      commitIndex(0)
      return
    }
    if (e.key === 'End') {
      e.preventDefault()
      commitIndex(MAX_INDEX)
    }
  }

  return (
    <div className={s.root}>
      <div className={s.row}>
        <span className={mergeClasses(s.letter, s.letterSm)} aria-hidden>A</span>
        <div
          ref={trackRef}
          className={mergeClasses(s.trackWrap, 'opptrix-focusable')}
          role="slider"
          tabIndex={0}
          aria-label="字体大小"
          aria-valuemin={0}
          aria-valuemax={MAX_INDEX}
          aria-valuenow={index}
          aria-valuetext={label}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        >
          <div className={s.track} aria-hidden />
          <div className={s.ticks} aria-hidden>
            {FONT_SCALE_OPTIONS.map((name, i) => (
              <span
                key={name}
                className={s.tick}
                style={{ left: `${MAX_INDEX === 0 ? 0 : (i / MAX_INDEX) * 100}%` }}
              />
            ))}
          </div>
          <div
            className={s.thumb}
            style={{ left: `${thumbPercent}%` }}
            aria-hidden
          />
        </div>
        <span className={mergeClasses(s.letter, s.letterLg)} aria-hidden>A</span>
      </div>
      <Text className={s.label} block>{label}</Text>
    </div>
  )
}
