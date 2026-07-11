import type { ColorScheme } from './tokens'
import { opptrixTokensDark, opptrixTokensLight } from './tokens'

/** CSS custom property names for color tokens */
export const CSS_VAR_KEYS = [
  'accent',
  'accent-hover',
  'accent-soft',
  'accent-muted',
  'accent-foreground',
  'canvas',
  'canvas-alt',
  'canvas-muted',
  'surface',
  'surface-muted',
  'surface-hover',
  'surface-glass',
  'glass',
  'glass-strong',
  'glass-nav-selected',
  'sidebar-glass',
  'sidebar-selected',
  'user-bubble',
  'gray-100',
  'gray-200',
  'gray-300',
  'separator',
  'separator-strong',
  'border',
  'border-strong',
  'text',
  'text-secondary',
  'text-tertiary',
  'success',
  'success-soft',
  'warning',
  'warning-soft',
  'error',
  'error-soft',
  'info-soft',
  'input-bg',
  'input-bg-hover',
  'input-bg-focus',
  'input-border',
  'input-border-focus',
  'focus-glow',
  'focus-border',
  'glass-panel-border-color',
  'glass-panel-shadow',
  'settings-panel-border-color',
  'popover-border-color',
  'popover-shadow',
  'composer-float-shadow',
  'composer-float-shadow-hover',
  'composer-float-shadow-focus',
  'overlay-sidebar-hover',
  'overlay-sidebar-selected',
  'glass-surface-bg',
  'glass-surface-border',
] as const

type TokenColorSource = typeof opptrixTokensLight | typeof opptrixTokensDark

function tokenToCssVarMap(tokens: TokenColorSource): Record<string, string> {
  return {
    accent: tokens.accent,
    'accent-hover': tokens.accentHover,
    'accent-soft': tokens.accentSoft,
    'accent-muted': tokens.accentMuted,
    'accent-foreground': tokens.accentForeground,
    canvas: tokens.canvas,
    'canvas-alt': tokens.canvasAlt,
    'canvas-muted': tokens.canvasMuted,
    surface: tokens.surface,
    'surface-muted': tokens.surfaceMuted,
    'surface-hover': tokens.surfaceHover,
    'surface-glass': tokens.surfaceGlass,
    glass: tokens.glass,
    'glass-strong': tokens.glassStrong,
    'glass-nav-selected': tokens.glassNavSelected,
    'sidebar-glass': tokens.sidebarGlass,
    'sidebar-selected': tokens.sidebarSelected,
    'user-bubble': tokens.userBubble,
    'gray-100': tokens.gray100,
    'gray-200': tokens.gray200,
    'gray-300': tokens.gray300,
    separator: tokens.separator,
    'separator-strong': tokens.separatorStrong,
    border: tokens.border,
    'border-strong': tokens.borderStrong,
    text: tokens.textPrimary,
    'text-secondary': tokens.textSecondary,
    'text-tertiary': tokens.textTertiary,
    success: tokens.success,
    'success-soft': tokens.successSoft,
    warning: tokens.warning,
    'warning-soft': tokens.warningSoft,
    error: tokens.error,
    'error-soft': tokens.errorSoft,
    'info-soft': tokens.infoSoft,
    'input-bg': tokens.inputBg,
    'input-bg-hover': tokens.inputBgHover,
    'input-bg-focus': tokens.inputBgFocus,
    'input-border': tokens.inputBorder,
    'input-border-focus': tokens.inputBorderFocus,
    'focus-glow': tokens.focusGlow,
    'focus-border': tokens.focusBorder,
    'glass-panel-border-color': tokens.glassPanelBorderColor,
    'glass-panel-shadow': tokens.glassPanelShadow,
    'settings-panel-border-color': tokens.settingsPanelBorderColor,
    'popover-border-color': tokens.popoverBorderColor,
    'popover-shadow': tokens.popoverShadow,
    'composer-float-shadow': tokens.composerFloatShadow,
    'composer-float-shadow-hover': tokens.composerFloatShadowHover,
    'composer-float-shadow-focus': tokens.composerFloatShadowFocus,
    'overlay-sidebar-hover': tokens.overlaySidebarHover,
    'overlay-sidebar-selected': tokens.overlaySidebarSelected,
    'glass-surface-bg': tokens.glassSurfaceBg,
    'glass-surface-border': tokens.glassSurfaceBorder,
  }
}

const LIGHT_VARS = tokenToCssVarMap(opptrixTokensLight)
const DARK_VARS = tokenToCssVarMap(opptrixTokensDark)

export function getCssVarValues(scheme: ColorScheme): Record<string, string> {
  return scheme === 'dark' ? DARK_VARS : LIGHT_VARS
}

export function applyCssVars(scheme: ColorScheme, root: HTMLElement = document.documentElement): void {
  const values = getCssVarValues(scheme)
  for (const [key, value] of Object.entries(values)) {
    root.style.setProperty(`--opptrix-${key}`, value)
  }
}
