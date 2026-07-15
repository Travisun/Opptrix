/**
 * Opptrix design tokens — monochrome palette, frosted glass, flat surfaces.
 * Color values are mirrored as CSS variables (--opptrix-*) for runtime theme switching.
 */

export type ThemePreference = 'system' | 'light' | 'dark'
export type ColorScheme = 'light' | 'dark'

const layoutTokens = {
  focusRingWidth: '2px',
  focusRingOffset: '2px',
  activeOpacity: 0.72,

  sidebarWidth: '200px',
  sidebarWidthPx: 200,
  settingsSidebarWidth: '210px',
  settingsSidebarWidthPx: 210,
  settingsContentWidth: '100%',
  settingsContentMaxWidth: '620px',
  windowInset: '6px',
  mobileDrawerWidth: 'min(88vw, 272px)',
  panelWidth: '380px',

  chatThreadMaxWidth: '820px',
  chatThreadPaddingX: '15px',
  chatThreadPaddingXMobile: '15px',
  chatComposerPadding: '12px',
  chatComposerBottomInset: '25px',
  chatComposerBottomInsetPx: 25,
  chatComposerGroundExtend: '10px',
  chatThreadScrollPadBottom: '212px',
  chatThreadScrollPadBottomMobile: '196px',
  chatThreadAlignInset: '3px',

  radiusSm: '6px',
  radiusMd: '10px',
  radiusLg: '14px',
  radiusXl: '18px',
  radiusFull: '999px',
  radiusGrouped: '12px',

  glassBlur: 'blur(28px) saturate(200%)',
  sidebarGlassBlur: 'blur(28px) saturate(200%)',

  shadowPanel: 'none',
  shadowSelected: 'none',
} as const

/**
 * Font size scale — indexed by level.
 * Compact: -1 | Default: 0 | Large: +1 | ExtraLarge: +2
 * Variables are injected at runtime based on user preference.
 * Components should use `var(--opptrix-font-*)` instead of hardcoded px.
 */
export const FONT_SCALES = {
  compact: {
    xs: '9px', sm: '10px', md: '11px', base: '12px',
    lg: '13px', xl: '14px', xxl: '15px', '3xl': '18px',
    '4xl': '22px', display: '32px',
  },
  default: {
    xs: '10px', sm: '11px', md: '12px', base: '13px',
    lg: '14px', xl: '15px', xxl: '16px', '3xl': '20px',
    '4xl': '24px', display: '36px',
  },
  large: {
    xs: '11px', sm: '12px', md: '13px', base: '14px',
    lg: '15px', xl: '16px', xxl: '17px', '3xl': '22px',
    '4xl': '26px', display: '38px',
  },
  xlarge: {
    xs: '12px', sm: '13px', md: '14px', base: '15px',
    lg: '16px', xl: '17px', xxl: '18px', '3xl': '24px',
    '4xl': '28px', display: '40px',
  },
} as const

export type FontScaleName = keyof typeof FONT_SCALES

export const opptrixTokensLight = {
  accent: '#1D1D1F',
  accentHover: '#000000',
  accentSoft: 'rgba(29, 29, 31, 0.07)',
  accentMuted: '#E5E5EA',
  accentForeground: '#FFFFFF',

  canvas: '#FFFFFF',
  canvasAlt: '#F5F5F7',
  canvasMuted: '#EBEBED',

  surface: '#FFFFFF',
  surfaceMuted: 'rgba(255, 255, 255, 0.42)',
  surfaceHover: 'rgba(255, 255, 255, 0.62)',
  surfaceGlass: 'rgba(255, 255, 255, 0.72)',

  glass: 'rgba(255, 255, 255, 0.14)',
  glassStrong: 'rgba(255, 255, 255, 0.22)',
  glassNavSelected: 'rgba(255, 255, 255, 0.38)',

  sidebarGlass: 'rgba(255, 255, 255, 0.14)',
  sidebarSelected: 'rgba(255, 255, 255, 0.38)',

  userBubble: '#F2F2F7',
  gray100: '#F2F2F7',
  gray200: '#E5E5EA',
  gray300: '#D1D1D6',

  separator: 'rgba(60, 60, 67, 0.14)',
  separatorStrong: 'rgba(60, 60, 67, 0.22)',
  border: 'rgba(60, 60, 67, 0.10)',
  borderStrong: 'rgba(60, 60, 67, 0.18)',

  textPrimary: '#1D1D1F',
  textSecondary: '#6E6E73',
  textTertiary: '#AEAEB2',

  success: '#34C759',
  successSoft: 'rgba(52, 199, 89, 0.1)',
  warning: '#FF9500',
  warningSoft: 'rgba(255, 149, 0, 0.1)',
  error: '#FF3B30',
  errorSoft: 'rgba(255, 59, 48, 0.1)',
  infoSoft: 'rgba(29, 29, 31, 0.06)',

  inputBg: '#F5F5F7',
  inputBgHover: '#EBEBED',
  inputBgFocus: '#FFFFFF',
  inputBorder: 'transparent',
  inputBorderFocus: '#1D1D1F',

  focusGlow: '0 0 0 3px rgba(29, 29, 31, 0.10)',
  focusBorder: 'rgba(60, 60, 67, 0.18)',

  composerFloatShadow: '0 1px 4px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 0, 0, 0.04)',
  composerFloatShadowHover: '0 2px 6px rgba(0, 0, 0, 0.07), 0 6px 16px rgba(0, 0, 0, 0.05)',
  composerFloatShadowFocus: '0 2px 8px rgba(0, 0, 0, 0.08), 0 8px 20px rgba(0, 0, 0, 0.06)',

  popoverBorderColor: 'rgba(60, 60, 67, 0.14)',
  popoverShadow: '0 2px 8px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03)',
  glassPanelBorderColor: 'rgba(60, 60, 67, 0.12)',
  glassPanelShadow: '0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 14px rgba(0, 0, 0, 0.065)',
  settingsPanelBorderColor: '#E5E5EA',
  glassSurfaceBg: 'rgba(255, 255, 255, 0.72)',
  glassSurfaceBorder: 'rgba(60, 60, 67, 0.12)',

  overlaySidebarHover: '#F2F2F7',
  overlaySidebarSelected: '#F2F2F7',

  /** Shorthand borders built from color tokens */
  popoverBorder: '1px solid rgba(60, 60, 67, 0.14)',
  glassPanelBorder: '1px solid rgba(60, 60, 67, 0.12)',
  settingsPanelBorder: '1px solid #E5E5EA',

  beige: '#F2F2F7',
  beigeMuted: '#E5E5EA',
} as const

export const opptrixTokensDark = {
  accent: '#F5F5F7',
  accentHover: '#FFFFFF',
  accentSoft: 'rgba(255, 255, 255, 0.08)',
  accentMuted: '#3A3A3C',
  accentForeground: '#1C1C1E',

  canvas: '#1C1C1E',
  canvasAlt: '#2C2C2E',
  canvasMuted: '#3A3A3C',

  surface: '#2C2C2E',
  surfaceMuted: 'rgba(44, 44, 46, 0.55)',
  surfaceHover: 'rgba(58, 58, 60, 0.72)',
  surfaceGlass: 'rgba(44, 44, 46, 0.72)',

  glass: 'rgba(44, 44, 46, 0.45)',
  glassStrong: 'rgba(58, 58, 60, 0.62)',
  glassNavSelected: 'rgba(72, 72, 74, 0.72)',

  sidebarGlass: 'rgba(44, 44, 46, 0.45)',
  sidebarSelected: 'rgba(72, 72, 74, 0.72)',

  userBubble: '#2C2C2E',
  gray100: '#2C2C2E',
  gray200: '#3A3A3C',
  gray300: '#48484A',

  separator: 'rgba(255, 255, 255, 0.15)',
  separatorStrong: 'rgba(255, 255, 255, 0.25)',
  border: 'rgba(255, 255, 255, 0.10)',
  borderStrong: 'rgba(255, 255, 255, 0.20)',

  textPrimary: '#F5F5F7',
  textSecondary: '#AEAEB2',
  textTertiary: '#6E6E73',

  success: '#30D158',
  successSoft: 'rgba(48, 209, 88, 0.14)',
  warning: '#FF9F0A',
  warningSoft: 'rgba(255, 159, 10, 0.14)',
  error: '#FF453A',
  errorSoft: 'rgba(255, 69, 58, 0.14)',
  infoSoft: 'rgba(255, 255, 255, 0.06)',

  inputBg: '#2C2C2E',
  inputBgHover: '#3A3A3C',
  inputBgFocus: '#48484A',
  inputBorder: 'transparent',
  inputBorderFocus: '#F5F5F7',

  focusGlow: '0 0 0 3px rgba(255, 255, 255, 0.12)',
  focusBorder: 'rgba(255, 255, 255, 0.18)',

  composerFloatShadow: '0 1px 4px rgba(0, 0, 0, 0.28), 0 4px 12px rgba(0, 0, 0, 0.22)',
  composerFloatShadowHover: '0 2px 6px rgba(0, 0, 0, 0.32), 0 6px 16px rgba(0, 0, 0, 0.26)',
  composerFloatShadowFocus: '0 2px 8px rgba(0, 0, 0, 0.36), 0 8px 20px rgba(0, 0, 0, 0.30)',

  popoverBorderColor: 'rgba(255, 255, 255, 0.14)',
  popoverShadow: '0 2px 8px rgba(0, 0, 0, 0.32), 0 1px 2px rgba(0, 0, 0, 0.24)',
  glassPanelBorderColor: 'rgba(255, 255, 255, 0.12)',
  glassPanelShadow: '0 1px 2px rgba(0, 0, 0, 0.28), 0 4px 14px rgba(0, 0, 0, 0.32)',
  settingsPanelBorderColor: '#3A3A3C',
  glassSurfaceBg: 'rgba(44, 44, 46, 0.72)',
  glassSurfaceBorder: 'rgba(255, 255, 255, 0.12)',

  overlaySidebarHover: '#3A3A3C',
  overlaySidebarSelected: '#48484A',

  popoverBorder: '1px solid rgba(255, 255, 255, 0.14)',
  glassPanelBorder: '1px solid rgba(255, 255, 255, 0.12)',
  settingsPanelBorder: '1px solid #3A3A3C',

  beige: '#2C2C2E',
  beigeMuted: '#3A3A3C',
} as const

/** Default export for backward compatibility — use opptrixCssVars in makeStyles for theme-aware colors */
export const opptrixTokens = {
  ...layoutTokens,
  ...opptrixTokensLight,
} as const

export function getOpptrixTokens(scheme: ColorScheme) {
  return {
    ...layoutTokens,
    ...(scheme === 'dark' ? opptrixTokensDark : opptrixTokensLight),
  }
}

/** CSS variable references — use in makeStyles for runtime theme switching */
export const opptrixCssVars = {
  accent: 'var(--opptrix-accent)',
  accentHover: 'var(--opptrix-accent-hover)',
  accentSoft: 'var(--opptrix-accent-soft)',
  accentMuted: 'var(--opptrix-accent-muted)',
  accentForeground: 'var(--opptrix-accent-foreground, #FFFFFF)',

  canvas: 'var(--opptrix-canvas)',
  canvasAlt: 'var(--opptrix-canvas-alt)',
  canvasMuted: 'var(--opptrix-canvas-muted)',

  surface: 'var(--opptrix-surface)',
  surfaceMuted: 'var(--opptrix-surface-muted)',
  surfaceHover: 'var(--opptrix-surface-hover)',
  surfaceGlass: 'var(--opptrix-surface-glass)',

  glass: 'var(--opptrix-glass)',
  glassStrong: 'var(--opptrix-glass-strong)',
  glassNavSelected: 'var(--opptrix-glass-nav-selected)',

  sidebarGlass: 'var(--opptrix-sidebar-glass)',
  sidebarSelected: 'var(--opptrix-sidebar-selected)',

  userBubble: 'var(--opptrix-user-bubble)',
  gray100: 'var(--opptrix-gray-100)',
  gray200: 'var(--opptrix-gray-200)',
  gray300: 'var(--opptrix-gray-300)',

  separator: 'var(--opptrix-separator)',
  separatorStrong: 'var(--opptrix-separator-strong)',
  border: 'var(--opptrix-border)',
  borderStrong: 'var(--opptrix-border-strong)',

  textPrimary: 'var(--opptrix-text)',
  textSecondary: 'var(--opptrix-text-secondary)',
  textTertiary: 'var(--opptrix-text-tertiary)',

  success: 'var(--opptrix-success)',
  successSoft: 'var(--opptrix-success-soft)',
  warning: 'var(--opptrix-warning)',
  warningSoft: 'var(--opptrix-warning-soft)',
  error: 'var(--opptrix-error)',
  errorSoft: 'var(--opptrix-error-soft)',
  infoSoft: 'var(--opptrix-info-soft)',

  inputBg: 'var(--opptrix-input-bg)',
  inputBgHover: 'var(--opptrix-input-bg-hover)',
  inputBgFocus: 'var(--opptrix-input-bg-focus)',
  inputBorder: 'var(--opptrix-input-border)',
  inputBorderFocus: 'var(--opptrix-input-border-focus)',

  focusGlow: 'var(--opptrix-focus-glow)',
  focusBorder: 'var(--opptrix-focus-border)',

  composerFloatShadow: 'var(--opptrix-composer-float-shadow)',
  composerFloatShadowHover: 'var(--opptrix-composer-float-shadow-hover)',
  composerFloatShadowFocus: 'var(--opptrix-composer-float-shadow-focus)',

  popoverBorderColor: 'var(--opptrix-popover-border-color)',
  popoverShadow: 'var(--opptrix-popover-shadow)',
  glassPanelBorderColor: 'var(--opptrix-glass-panel-border-color)',
  glassPanelShadow: 'var(--opptrix-glass-panel-shadow)',
  settingsPanelBorderColor: 'var(--opptrix-settings-panel-border-color)',
  glassSurfaceBg: 'var(--opptrix-glass-surface-bg)',
  glassSurfaceBorder: 'var(--opptrix-glass-surface-border)',

  overlaySidebarHover: 'var(--opptrix-overlay-sidebar-hover)',
  overlaySidebarSelected: 'var(--opptrix-overlay-sidebar-selected)',

  popoverBorder: '1px solid var(--opptrix-popover-border-color)',
  glassPanelBorder: '1px solid var(--opptrix-glass-panel-border-color)',
  settingsPanelBorder: '1px solid var(--opptrix-settings-panel-border-color)',

  beige: 'var(--opptrix-gray-100)',
  beigeMuted: 'var(--opptrix-gray-200)',
} as const

export const MARKET_UP = '#FF3B30'
export const MARKET_DOWN = '#34C759'
