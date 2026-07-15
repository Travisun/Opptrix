import { opptrixCssVars, opptrixTokens } from './tokens'

export const motion = {
  fast: '140ms',
  normal: '220ms',
  slow: '360ms',
  /** Apple default curve: 0.4, 0, 0.2, 1 */
  ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  /** Emil Kowalski strong ease-out — for UI interactions */
  easeOutStrong: 'cubic-bezier(0.23, 1, 0.32, 1)',
  /** Button press — fastest tier */
  press: '100ms',
  /** Dropdowns, popovers */
  popover: '180ms',
} as const

/** Keyboard focus ring — buttons, links, icon controls */
export const focusRing = {
  outline: `${opptrixTokens.focusRingWidth} solid ${opptrixCssVars.inputBorderFocus}`,
  outlineOffset: opptrixTokens.focusRingOffset,
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
  backgroundColor: opptrixCssVars.inputBg,
  border: `1px solid transparent`,
  borderRadius: opptrixTokens.radiusMd,
  boxShadow: 'none',
  ':hover': {
    backgroundColor: opptrixCssVars.inputBgHover,
  },
  ':focus-within': {
    backgroundColor: opptrixCssVars.inputBgFocus,
    border: `1px solid ${opptrixCssVars.borderStrong}`,
    boxShadow: 'none',
  },
} as const

/** @deprecated use inputShellInteractive */
export const inputSurface = inputShellInteractive

export const glassPanel = {
  backgroundColor: opptrixCssVars.glass,
  backdropFilter: opptrixTokens.glassBlur,
  WebkitBackdropFilter: opptrixTokens.glassBlur,
} as const

/** 下拉浮层 / 面板 — 毛玻璃（与 Dialog、MessageSelectionToolbar 一致） */
export const glassDropdown = {
  backgroundColor: opptrixCssVars.glassSurfaceBg,
  backdropFilter: 'blur(16px) saturate(160%)',
  WebkitBackdropFilter: 'blur(16px) saturate(160%)',
  border: opptrixCssVars.glassPanelBorder,
  boxShadow: opptrixCssVars.glassPanelShadow,
} as const

/** 毛玻璃浮层基础类 — 见 docs/UI-DESIGN-SYSTEM.md §5.1 */
export const OPPTRIX_GLASS_PANEL_CLASS = 'opptrix-glass-panel'

/** Fluent Dropdown Listbox / 选项列表浮层 */
export const OPPTRIX_GLASS_DROPDOWN_LISTBOX_CLASS = 'opptrix-glass-dropdown opptrix-glass-panel opptrix-scroll'

/** @deprecated 使用 OPPTRIX_GLASS_DROPDOWN_LISTBOX_CLASS */
export const glassDropdownClassName = OPPTRIX_GLASS_DROPDOWN_LISTBOX_CLASS

export const contentPanel = {
  backgroundColor: opptrixCssVars.canvas,
  borderRadius: opptrixTokens.radiusLg,
  border: 'none',
  boxShadow: 'none',
  overflow: 'hidden',
} as const

export const panelFloat = {
  backgroundColor: opptrixCssVars.surfaceGlass,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderRadius: opptrixTokens.radiusLg,
  border: 'none',
  boxShadow: 'none',
} as const

export const composerSurface = {
  ...interactiveTransition,
  backgroundColor: opptrixCssVars.canvas,
  borderRadius: opptrixTokens.radiusXl,
  border: `1px solid ${opptrixCssVars.border}`,
  boxShadow: 'none',
  ':hover': {
    border: `1px solid ${opptrixCssVars.borderStrong}`,
  },
  ':focus-within': {
    border: `1px solid ${opptrixCssVars.borderStrong}`,
    backgroundColor: opptrixCssVars.canvas,
    boxShadow: 'none',
  },
}

export const ghostInteractive = {
  ...interactiveTransition,
  border: 'none',
  borderRadius: opptrixTokens.radiusMd,
  backgroundColor: 'transparent',
  ':hover': {
    backgroundColor: opptrixCssVars.surfaceHover,
  },
  ':active': {
    opacity: opptrixTokens.activeOpacity,
  },
  ...focusVisibleRing,
} as const

export const primaryInteractive = {
  ...interactiveTransition,
  border: 'none',
  borderRadius: opptrixTokens.radiusMd,
  backgroundColor: opptrixCssVars.accent,
  color: opptrixCssVars.accentForeground,
  ':hover': {
    backgroundColor: opptrixCssVars.accentHover,
  },
  ':active': {
    opacity: 0.88,
  },
  ':disabled': {
    opacity: 0.35,
    backgroundColor: opptrixCssVars.accent,
  },
  ...focusVisibleRing,
} as const

export const secondaryInteractive = {
  ...interactiveTransition,
  border: 'none',
  borderRadius: opptrixTokens.radiusMd,
  backgroundColor: opptrixCssVars.canvasAlt,
  color: opptrixCssVars.textPrimary,
  ':hover': {
    backgroundColor: opptrixCssVars.canvasMuted,
  },
  ':active': {
    opacity: opptrixTokens.activeOpacity,
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
  color: opptrixCssVars.textSecondary,
  ':hover': {
    color: opptrixCssVars.textPrimary,
  },
  ':active': {
    opacity: opptrixTokens.activeOpacity,
  },
  ...focusVisibleRing,
} as const

export const surfaceGrouped = {
  backgroundColor: opptrixCssVars.canvasAlt,
  borderRadius: opptrixTokens.radiusGrouped,
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
  borderRadius: opptrixTokens.radiusLg,
  border: 'none',
  boxShadow: 'none',
} as const

export const sidebarItemSelected = {
  backgroundColor: opptrixCssVars.glassNavSelected,
  border: 'none',
  boxShadow: 'none',
} as const

/** Icon size for sidebar top rows (新对话, overlay settings nav, …) */
export const SIDEBAR_TOP_MENU_ICON_SIZE = 18

/** Shared layout for sidebar top menu rows — keep overlay settings nav in sync */
export const sidebarTopMenuRow = {
  ...ghostInteractive,
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '5px 10px',
  marginLeft: '10px',
  marginRight: '10px',
  color: opptrixCssVars.textPrimary,
  fontSize: '13px',
  fontWeight: 500,
  width: 'calc(100% - 20px)',
  textAlign: 'left' as const,
} as const

export const sidebarTopMenuIcon = {
  color: opptrixCssVars.textSecondary,
  flexShrink: 0,
} as const

/** Button size tokens — injected onto root for size prop */
export const buttonSizes = {
  small: { minHeight: '24px', paddingX: '8px', fontSize: 'var(--opptrix-font-sm)' },
  medium: { minHeight: '32px', paddingX: '14px', fontSize: 'var(--opptrix-font-base)' },
  large: { minHeight: '40px', paddingX: '18px', fontSize: 'var(--opptrix-font-lg)' },
} as const

/** Danger variant — destructive actions (delete, stop, quit) */
export const dangerInteractive = {
  ...interactiveTransition,
  border: 'none',
  borderRadius: opptrixTokens.radiusMd,
  backgroundColor: opptrixCssVars.errorSoft,
  color: opptrixCssVars.error,
  ':hover': {
    backgroundColor: opptrixCssVars.error,
    color: '#FFFFFF',
  },
  ':active': { opacity: 0.88 },
  ':disabled': { opacity: 0.34, backgroundColor: opptrixCssVars.errorSoft, color: opptrixCssVars.error },
  ...focusVisibleRing,
} as const

/** Press state mixin — scale transform only, no bounce */
export const buttonPress = {
  ':active': { transform: 'scale(0.97)' },
  transition: `transform ${motion.press} ease-out`,
} as const

/** Icon-only button mixin — shared between OpptrixButton and ChromeToolButton */
export const iconBtnMixin = (size: 'sm' | 'md' | 'lg' | 'xl' = 'md') => {
  const sizes = {
    sm: { dimension: '24px', iconSize: '12px', radius: opptrixTokens.radiusSm },
    md: { dimension: '28px', iconSize: '14px', radius: opptrixTokens.radiusMd },
    lg: { dimension: '36px', iconSize: '18px', radius: opptrixTokens.radiusMd },
    xl: { dimension: '44px', iconSize: '20px', radius: opptrixTokens.radiusLg },
  }
  const s = sizes[size]
  return {
    ...ghostInteractive,
    width: s.dimension,
    height: s.dimension,
    minWidth: s.dimension,
    minHeight: s.dimension,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    borderRadius: s.radius,
    '& svg': { width: s.iconSize, height: s.iconSize },
  } as const
}
