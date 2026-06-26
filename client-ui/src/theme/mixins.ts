import { innoTokens } from './tokens'

export const motion = {
  fast: '140ms',
  normal: '220ms',
  slow: '360ms',
  ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
} as const

/** Native focus — outline only, no shadow */
export const focusRing = {
  outline: `2px solid ${innoTokens.inputBorderFocus}`,
  outlineOffset: '2px',
} as const

/** iOS/macOS filled input field */
export const inputSurface = {
  backgroundColor: innoTokens.inputBg,
  border: `1px solid ${innoTokens.inputBorder}`,
  borderRadius: innoTokens.radiusMd,
  transitionProperty: 'background-color, border-color',
  transitionDuration: motion.fast,
  transitionTimingFunction: motion.ease,
  ':hover': {
    backgroundColor: innoTokens.inputBgHover,
  },
  ':focus-within': {
    backgroundColor: innoTokens.inputBgFocus,
    borderColor: innoTokens.inputBorderFocus,
  },
} as const

/** Chat composer capsule */
export const composerSurface = {
  ...inputSurface,
  borderRadius: innoTokens.radiusFull,
}

export const ghostInteractive = {
  border: 'none',
  borderRadius: innoTokens.radiusMd,
  transitionProperty: 'background-color, color, opacity',
  transitionDuration: motion.fast,
  transitionTimingFunction: motion.ease,
  ':hover': {
    backgroundColor: innoTokens.surfaceMuted,
  },
  ':active': {
    opacity: 0.72,
  },
  ':focus-visible': focusRing,
} as const

export const primaryInteractive = {
  border: 'none',
  borderRadius: innoTokens.radiusMd,
  transitionProperty: 'background-color, opacity, filter',
  transitionDuration: motion.fast,
  transitionTimingFunction: motion.ease,
  ':hover': {
    filter: 'brightness(1.05)',
  },
  ':active': {
    opacity: 0.88,
  },
  ':focus-visible': focusRing,
} as const

/** iOS grouped list section */
export const surfaceGrouped = {
  backgroundColor: innoTokens.surface,
  borderRadius: innoTokens.radiusGrouped,
  border: `1px solid ${innoTokens.separator}`,
  overflow: 'hidden',
} as const

export const hairlineBottom = {
  borderBottom: `1px solid ${innoTokens.separator}`,
} as const

export const hairlineTop = {
  borderTop: `1px solid ${innoTokens.separator}`,
} as const

export const fadeInUp = {
  animationDuration: motion.normal,
  animationTimingFunction: motion.easeOut,
  animationFillMode: 'both',
  animationName: {
    from: { opacity: 0, transform: 'translateY(4px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
  },
} as const
