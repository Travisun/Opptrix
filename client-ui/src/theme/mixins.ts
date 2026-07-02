import { opptrixTokens } from './tokens'

export const motion = {
  fast: '140ms',
  normal: '220ms',
  slow: '360ms',
  ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
} as const

/** Keyboard focus ring — buttons, links, icon controls */
export const focusRing = {
  outline: `${opptrixTokens.focusRingWidth} solid ${opptrixTokens.inputBorderFocus}`,
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
  backgroundColor: opptrixTokens.inputBg,
  border: `1px solid transparent`,
  borderRadius: opptrixTokens.radiusMd,
  boxShadow: 'none',
  ':hover': {
    backgroundColor: opptrixTokens.inputBgHover,
  },
  ':focus-within': {
    backgroundColor: opptrixTokens.inputBgFocus,
    borderColor: opptrixTokens.borderStrong,
    boxShadow: 'none',
  },
} as const

/** @deprecated use inputShellInteractive */
export const inputSurface = inputShellInteractive

export const glassPanel = {
  backgroundColor: opptrixTokens.glass,
  backdropFilter: opptrixTokens.glassBlur,
  WebkitBackdropFilter: opptrixTokens.glassBlur,
} as const

/** 下拉浮层 / 面板 — 毛玻璃（与 Dialog、MessageSelectionToolbar 一致） */
export const glassDropdown = {
  backgroundColor: 'rgba(255, 255, 255, 0.72)',
  backdropFilter: 'blur(16px) saturate(160%)',
  WebkitBackdropFilter: 'blur(16px) saturate(160%)',
  border: opptrixTokens.glassPanelBorder,
  boxShadow: opptrixTokens.glassPanelShadow,
} as const

/** 毛玻璃浮层基础类 — 见 docs/UI-DESIGN-SYSTEM.md §5.1 */
export const OPPTRIX_GLASS_PANEL_CLASS = 'opptrix-glass-panel'

/** Fluent Dropdown Listbox / 选项列表浮层 */
export const OPPTRIX_GLASS_DROPDOWN_LISTBOX_CLASS = 'opptrix-glass-dropdown opptrix-glass-panel opptrix-scroll'

/** @deprecated 使用 OPPTRIX_GLASS_DROPDOWN_LISTBOX_CLASS */
export const glassDropdownClassName = OPPTRIX_GLASS_DROPDOWN_LISTBOX_CLASS

export const contentPanel = {
  backgroundColor: opptrixTokens.canvas,
  borderRadius: opptrixTokens.radiusLg,
  border: 'none',
  boxShadow: 'none',
  overflow: 'hidden',
} as const

export const panelFloat = {
  backgroundColor: opptrixTokens.surfaceGlass,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderRadius: opptrixTokens.radiusLg,
  border: 'none',
  boxShadow: 'none',
} as const

export const composerSurface = {
  ...interactiveTransition,
  backgroundColor: opptrixTokens.canvas,
  borderRadius: opptrixTokens.radiusXl,
  border: `1px solid ${opptrixTokens.border}`,
  boxShadow: 'none',
  ':hover': {
    borderColor: opptrixTokens.borderStrong,
  },
  ':focus-within': {
    borderColor: opptrixTokens.borderStrong,
    backgroundColor: opptrixTokens.canvas,
    boxShadow: 'none',
  },
}

export const ghostInteractive = {
  ...interactiveTransition,
  border: 'none',
  borderRadius: opptrixTokens.radiusMd,
  backgroundColor: 'transparent',
  ':hover': {
    backgroundColor: opptrixTokens.surfaceHover,
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
  backgroundColor: opptrixTokens.accent,
  color: '#FFFFFF',
  ':hover': {
    backgroundColor: opptrixTokens.accentHover,
  },
  ':active': {
    opacity: 0.88,
  },
  ':disabled': {
    opacity: 0.35,
    backgroundColor: opptrixTokens.accent,
  },
  ...focusVisibleRing,
} as const

export const secondaryInteractive = {
  ...interactiveTransition,
  border: 'none',
  borderRadius: opptrixTokens.radiusMd,
  backgroundColor: opptrixTokens.canvasAlt,
  color: opptrixTokens.textPrimary,
  ':hover': {
    backgroundColor: opptrixTokens.canvasMuted,
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
  color: opptrixTokens.textSecondary,
  ':hover': {
    color: opptrixTokens.textPrimary,
  },
  ':active': {
    opacity: opptrixTokens.activeOpacity,
  },
  ...focusVisibleRing,
} as const

export const surfaceGrouped = {
  backgroundColor: opptrixTokens.canvasAlt,
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
  backgroundColor: opptrixTokens.glassNavSelected,
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
  borderRadius: opptrixTokens.radiusMd,
  cursor: 'pointer',
  border: 'none',
  backgroundColor: 'transparent',
  color: opptrixTokens.textPrimary,
  fontSize: '13px',
  fontWeight: 500,
  width: 'calc(100% - 20px)',
  textAlign: 'left' as const,
  ...ghostInteractive,
} as const

export const sidebarTopMenuIcon = {
  color: opptrixTokens.textSecondary,
  flexShrink: 0,
} as const
