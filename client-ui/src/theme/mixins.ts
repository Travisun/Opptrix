import { innoTokens } from './tokens'

export const motion = {
  fast: '140ms',
  normal: '220ms',
  slow: '360ms',
  ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
} as const

/** Keyboard focus ring — buttons, links, icon controls */
export const focusRing = {
  outline: `${innoTokens.focusRingWidth} solid ${innoTokens.inputBorderFocus}`,
  outlineOffset: innoTokens.focusRingOffset,
} as const

export const focusVisibleRing = {
  ':focus': { outline: 'none' },
  ':focus-visible': focusRing,
} as const

export const interactiveTransition = {
  transitionProperty: 'background-color, color, opacity, border-color, box-shadow',
  transitionDuration: motion.fast,
  transitionTimingFunction: motion.ease,
} as const

/** Input / select container — hover + focus-within glow on shell */
export const inputShellInteractive = {
  ...interactiveTransition,
  backgroundColor: innoTokens.inputBg,
  border: `1px solid transparent`,
  borderRadius: innoTokens.radiusMd,
  boxShadow: 'none',
  ':hover': {
    backgroundColor: innoTokens.inputBgHover,
  },
  ':focus-within': {
    backgroundColor: innoTokens.inputBgFocus,
    borderColor: innoTokens.borderStrong,
    boxShadow: 'none',
  },
} as const

/** @deprecated use inputShellInteractive */
export const inputSurface = inputShellInteractive

export const glassPanel = {
  backgroundColor: innoTokens.glass,
  backdropFilter: innoTokens.glassBlur,
  WebkitBackdropFilter: innoTokens.glassBlur,
} as const

export const contentPanel = {
  backgroundColor: innoTokens.canvas,
  borderRadius: innoTokens.radiusLg,
  border: 'none',
  boxShadow: 'none',
  overflow: 'hidden',
} as const

export const panelFloat = {
  backgroundColor: innoTokens.surfaceGlass,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderRadius: innoTokens.radiusLg,
  border: 'none',
  boxShadow: 'none',
} as const

export const composerSurface = {
  ...interactiveTransition,
  backgroundColor: innoTokens.canvas,
  borderRadius: innoTokens.radiusXl,
  border: `1px solid ${innoTokens.border}`,
  boxShadow: 'none',
  ':hover': {
    borderColor: innoTokens.borderStrong,
  },
  ':focus-within': {
    borderColor: innoTokens.borderStrong,
    backgroundColor: innoTokens.canvas,
    boxShadow: 'none',
  },
}

export const ghostInteractive = {
  ...interactiveTransition,
  border: 'none',
  borderRadius: innoTokens.radiusMd,
  backgroundColor: 'transparent',
  ':hover': {
    backgroundColor: innoTokens.surfaceHover,
  },
  ':active': {
    opacity: innoTokens.activeOpacity,
  },
  ...focusVisibleRing,
} as const

export const primaryInteractive = {
  ...interactiveTransition,
  border: 'none',
  borderRadius: innoTokens.radiusMd,
  backgroundColor: innoTokens.accent,
  color: '#FFFFFF',
  ':hover': {
    backgroundColor: innoTokens.accentHover,
  },
  ':active': {
    opacity: 0.88,
  },
  ':disabled': {
    opacity: 0.35,
    backgroundColor: innoTokens.accent,
  },
  ...focusVisibleRing,
} as const

export const secondaryInteractive = {
  ...interactiveTransition,
  border: 'none',
  borderRadius: innoTokens.radiusMd,
  backgroundColor: innoTokens.canvasAlt,
  color: innoTokens.textPrimary,
  ':hover': {
    backgroundColor: innoTokens.canvasMuted,
  },
  ':active': {
    opacity: innoTokens.activeOpacity,
  },
  ...focusVisibleRing,
} as const

export const nativeIconInteractive = {
  ...interactiveTransition,
  padding: 0,
  margin: 0,
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  color: innoTokens.textSecondary,
  ':hover': {
    color: innoTokens.textPrimary,
  },
  ':active': {
    opacity: innoTokens.activeOpacity,
  },
  ...focusVisibleRing,
} as const

export const surfaceGrouped = {
  backgroundColor: innoTokens.canvasAlt,
  borderRadius: innoTokens.radiusGrouped,
  border: 'none',
  boxShadow: 'none',
  overflow: 'hidden',
} as const

export const hairlineBottom = {
  borderBottom: 'none',
} as const

export const hairlineTop = {
  borderTop: 'none',
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

export const messageBubble = {
  borderRadius: innoTokens.radiusLg,
  border: 'none',
  boxShadow: 'none',
} as const

export const sidebarItemSelected = {
  backgroundColor: innoTokens.glassNavSelected,
  border: 'none',
  boxShadow: 'none',
} as const

/** Icon size for sidebar top rows (新对话, overlay settings nav, …) */
export const SIDEBAR_TOP_MENU_ICON_SIZE = 18

/** Shared layout for sidebar top menu rows — keep overlay settings nav in sync */
export const sidebarTopMenuRow = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '5px 10px',
  marginLeft: '10px',
  marginRight: '10px',
  borderRadius: innoTokens.radiusMd,
  cursor: 'pointer',
  border: 'none',
  backgroundColor: 'transparent',
  color: innoTokens.textPrimary,
  fontSize: '13px',
  fontWeight: 500,
  width: 'calc(100% - 20px)',
  textAlign: 'left' as const,
  ...ghostInteractive,
} as const

export const sidebarTopMenuIcon = {
  color: innoTokens.textSecondary,
  flexShrink: 0,
} as const
