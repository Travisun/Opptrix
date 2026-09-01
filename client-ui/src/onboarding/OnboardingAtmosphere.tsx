import { useEffect, useRef, type RefObject } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { opptrixCssVars } from '../theme/tokens'

const useStyles = makeStyles({
  root: {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    userSelect: 'none',
  },
  wash: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `
      radial-gradient(ellipse 90% 70% at 50% -10%, color-mix(in srgb, ${opptrixCssVars.accent} 7%, transparent) 0%, transparent 55%),
      radial-gradient(ellipse 70% 50% at 100% 100%, color-mix(in srgb, ${opptrixCssVars.accent} 4%, transparent) 0%, transparent 50%),
      linear-gradient(180deg, ${opptrixCssVars.canvas} 0%, color-mix(in srgb, ${opptrixCssVars.canvasAlt} 55%, ${opptrixCssVars.canvas}) 100%)
    `,
  },
  /** Idle drift kept separate from pointer warp via CSS vars on host. */
  grid: {
    position: 'absolute',
    inset: '-6%',
    opacity: 0.55,
    backgroundImage: `
      linear-gradient(to right, color-mix(in srgb, ${opptrixCssVars.separator} 72%, transparent) 1px, transparent 1px),
      linear-gradient(to bottom, color-mix(in srgb, ${opptrixCssVars.separator} 72%, transparent) 1px, transparent 1px)
    `,
    backgroundSize: '44px 44px',
    maskImage: 'radial-gradient(ellipse 85% 75% at 50% 45%, #000 20%, transparent 78%)',
    transformOrigin: '50% 45%',
    transform: `
      translate3d(
        calc(var(--onb-dx, 0) * -14px),
        calc(var(--onb-dy, 0) * -10px),
        0
      )
      skewX(calc(var(--onb-dx, 0) * -1.1deg))
      skewY(calc(var(--onb-dy, 0) * 0.7deg))
    `,
    transitionProperty: 'transform',
    transitionDuration: '420ms',
    transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
    willChange: 'transform',
    animationName: {
      '0%': { backgroundPosition: '0 0' },
      '50%': { backgroundPosition: '-10px -6px' },
      '100%': { backgroundPosition: '0 0' },
    },
    animationDuration: '48s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
      animationDuration: '0.01ms',
      transitionDuration: '0.01ms',
      transform: 'none',
    },
  },
  diagonal: {
    position: 'absolute',
    inset: '-10%',
    opacity: 0.28,
    backgroundImage: `repeating-linear-gradient(
      -32deg,
      transparent 0,
      transparent 11px,
      color-mix(in srgb, ${opptrixCssVars.borderStrong} 28%, transparent) 11px,
      color-mix(in srgb, ${opptrixCssVars.borderStrong} 28%, transparent) 12px
    )`,
    maskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, #000 15%, transparent 72%)',
    transformOrigin: '50% 50%',
    transform: `
      translate3d(
        calc(var(--onb-dx, 0) * 18px),
        calc(var(--onb-dy, 0) * 12px),
        0
      )
      skewX(calc(var(--onb-dx, 0) * 1.4deg))
      skewY(calc(var(--onb-dy, 0) * -0.9deg))
    `,
    transitionProperty: 'transform',
    transitionDuration: '480ms',
    transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
    willChange: 'transform',
    animationName: {
      '0%': { backgroundPosition: '0 0' },
      '50%': { backgroundPosition: '8px 4px' },
      '100%': { backgroundPosition: '0 0' },
    },
    animationDuration: '64s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
    animationDirection: 'alternate',
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
      animationDuration: '0.01ms',
      transitionDuration: '0.01ms',
      transform: 'none',
    },
  },
  vignette: {
    position: 'absolute',
    inset: 0,
    boxShadow: `inset 0 0 120px color-mix(in srgb, ${opptrixCssVars.canvas} 70%, transparent)`,
  },
})

/**
 * Light fintech atmosphere — grid + diagonal with pointer-driven warp (no color spotlight).
 */
export function OnboardingAtmosphere({
  hostRef,
}: {
  /** Shell root — `--onb-dx` / `--onb-dy` in [-1, 1] */
  hostRef: RefObject<HTMLElement | null>
}) {
  const s = useStyles()
  const rafRef = useRef(0)
  const reduceRef = useRef(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => { reduceRef.current = mq.matches }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const onMove = (ev: PointerEvent) => {
      if (reduceRef.current) return
      const rect = host.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      // Normalize to [-1, 1] from center
      const dx = ((ev.clientX - rect.left) / rect.width) * 2 - 1
      const dy = ((ev.clientY - rect.top) / rect.height) * 2 - 1
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        host.style.setProperty('--onb-dx', dx.toFixed(4))
        host.style.setProperty('--onb-dy', dy.toFixed(4))
      })
    }

    const onLeave = () => {
      if (reduceRef.current) return
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        host.style.setProperty('--onb-dx', '0')
        host.style.setProperty('--onb-dy', '0')
      })
    }

    host.addEventListener('pointermove', onMove, { passive: true })
    host.addEventListener('pointerleave', onLeave)
    return () => {
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
      cancelAnimationFrame(rafRef.current)
    }
  }, [hostRef])

  return (
    <div
      className={mergeClasses(s.root, 'opptrix-onboarding-atmosphere')}
      aria-hidden
    >
      <div className={s.wash} />
      <div className={s.grid} />
      <div className={s.diagonal} />
      <div className={s.vignette} />
    </div>
  )
}
