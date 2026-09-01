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

  sidebarWidth: '250px',
  sidebarWidthPx: 250,
  settingsSidebarWidth: '260px',
  settingsSidebarWidthPx: 260,
  settingsContentWidth: '100%',
  settingsContentMaxWidth: '620px',
  /** Expert market / catalog pages — wider than settings for dual-column cards */
  expertsContentMaxWidth: '760px',
  windowInset: '6px',
  mobileDrawerWidth: 'min(88vw, 272px)',
  panelWidth: '380px',

  chatThreadMaxWidth: '820px',
  /** Desktop thread/composer horizontal inset (symmetric left & right). */
  chatThreadPaddingX: '25px',
  /**
   * @deprecated Use `chatThreadPaddingX`. Outline rail is an overlay; no extra left padding.
   */
  chatThreadPaddingLeft: '25px',
  /** Desktop message-outline left-edge hover hit strip (overlay; no layout gutter). */
  chatOutlineHitWidth: '16px',
  /** Visual width of the outline dot column. */
  chatOutlineRailWidth: '28px',
  /** @deprecated Use `chatOutlineHitWidth` / `chatOutlineRailWidth`. */
  chatOutlineGutterWidth: '16px',
  chatThreadPaddingXMobile: '15px',
  chatComposerPadding: '12px',
  /** Composer 输入卡圆角（偏 pill，对齐 Cursor 单行输入卡；勿改全局 radiusXl） */
  chatComposerRadius: '20px',
  chatComposerBottomInset: '25px',
  chatComposerBottomInsetPx: 25,
  /** 移动 Web：底栏再贴底一点（仍不低于 safe-area） */
  chatComposerBottomInsetMobile: '12px',
  chatComposerBottomInsetMobilePx: 12,
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

/**
 * Light palette — aligned to Cursor Light (`theme-cursor/cursor-light-color-theme.json`):
 * main editor `#FCFCFC`, sidebar/chrome `#F3F3F3`, ink `#141414` + alpha borders/hover.
 * Brand accent stays Opptrix ink (`#141414`), not Cursor button blue (`#2778C1`).
 */
export const opptrixTokensLight = {
  accent: '#141414',
  accentHover: '#000000',
  accentSoft: 'rgba(20, 20, 20, 0.08)',
  accentMuted: 'rgba(20, 20, 20, 0.14)',
  accentForeground: '#FCFCFC',

  /** Main content — Cursor `editor.background` (brighter than sidebar) */
  canvas: '#FCFCFC',
  /** Left sidebar / chrome — Cursor `sideBar.background` */
  canvasAlt: '#F3F3F3',
  /** Muted fill — one step below chrome (no Cursor direct map) */
  canvasMuted: '#EEEEEE',

  surface: '#FCFCFC',
  surfaceMuted: 'rgba(252, 252, 252, 0.72)',
  /** List / row hover — Cursor `list.hoverBackground` `#14141414` */
  surfaceHover: 'rgba(20, 20, 20, 0.08)',
  surfaceGlass: 'rgba(252, 252, 252, 0.72)',

  glass: 'rgba(255, 255, 255, 0.14)',
  glassStrong: 'rgba(255, 255, 255, 0.22)',
  glassNavSelected: 'rgba(20, 20, 20, 0.08)',

  sidebarGlass: 'rgba(255, 255, 255, 0.14)',
  sidebarSelected: 'rgba(20, 20, 20, 0.08)',

  /** Align with canvas / Composer input card */
  userBubble: '#FCFCFC',
  gray100: '#F3F3F3',
  gray200: '#EEEEEE',
  gray300: 'rgba(20, 20, 20, 0.20)',

  /** Cursor `sideBar.border` / `panel.border` `#14141414` */
  separator: 'rgba(20, 20, 20, 0.08)',
  separatorStrong: 'rgba(20, 20, 20, 0.12)',
  border: 'rgba(20, 20, 20, 0.08)',
  borderStrong: 'rgba(20, 20, 20, 0.20)',

  textPrimary: '#141414',
  /** Cursor sidebar/secondary `#141414BD` ≈ 74% */
  textSecondary: 'rgba(20, 20, 20, 0.74)',
  /** Cursor muted `#14141499` ≈ 60% */
  textTertiary: 'rgba(20, 20, 20, 0.60)',

  success: '#34C759',
  successSoft: 'rgba(52, 199, 89, 0.1)',
  warning: '#FF9500',
  warningSoft: 'rgba(255, 149, 0, 0.1)',
  error: '#FF3B30',
  errorSoft: 'rgba(255, 59, 48, 0.1)',
  infoSoft: 'rgba(20, 20, 20, 0.06)',

  /** Cursor `input.background` / `dropdown.background` */
  inputBg: '#FCFCFC',
  inputBgHover: '#F3F3F3',
  inputBgFocus: '#FCFCFC',
  inputBorder: 'transparent',
  inputBorderFocus: 'rgba(20, 20, 20, 0.20)',

  focusGlow: '0 0 0 3px rgba(20, 20, 20, 0.10)',
  focusBorder: 'rgba(20, 20, 20, 0.20)',

  composerFloatShadow: '0 1px 4px rgba(20, 20, 20, 0.06), 0 4px 12px rgba(20, 20, 20, 0.04)',
  composerFloatShadowHover: '0 2px 6px rgba(20, 20, 20, 0.07), 0 6px 16px rgba(20, 20, 20, 0.05)',
  composerFloatShadowFocus: '0 2px 8px rgba(20, 20, 20, 0.08), 0 8px 20px rgba(20, 20, 20, 0.06)',

  popoverBorderColor: 'rgba(20, 20, 20, 0.12)',
  popoverShadow: '0 2px 8px rgba(20, 20, 20, 0.05), 0 1px 2px rgba(20, 20, 20, 0.03)',
  glassPanelBorderColor: 'rgba(20, 20, 20, 0.12)',
  glassPanelShadow: '0 1px 2px rgba(20, 20, 20, 0.04), 0 4px 14px rgba(20, 20, 20, 0.065)',
  settingsPanelBorderColor: 'rgba(20, 20, 20, 0.12)',
  glassSurfaceBg: 'rgba(252, 252, 252, 0.72)',
  glassSurfaceBorder: 'rgba(20, 20, 20, 0.12)',

  overlaySidebarHover: 'rgba(20, 20, 20, 0.08)',
  overlaySidebarSelected: 'rgba(20, 20, 20, 0.08)',

  /** Shorthand borders built from color tokens */
  popoverBorder: '1px solid rgba(20, 20, 20, 0.12)',
  glassPanelBorder: '1px solid rgba(20, 20, 20, 0.12)',
  settingsPanelBorder: '1px solid rgba(20, 20, 20, 0.12)',

  beige: '#F3F3F3',
  beigeMuted: '#EEEEEE',
} as const

/**
 * Dark palette — aligned to Cursor Dark (`cursor-dark-color-theme.json`):
 * sidebar `#141414` (darker), editor `#181818`, ink `#F0F0F0` + alpha.
 * Brand accent stays Opptrix ink (`#F0F0F0`), not Cursor button blue (`#81A1C1`).
 */
export const opptrixTokensDark = {
  accent: '#F0F0F0',
  accentHover: '#FFFFFF',
  accentSoft: 'rgba(240, 240, 240, 0.08)',
  accentMuted: 'rgba(240, 240, 240, 0.14)',
  accentForeground: '#181818',

  /** Main content — Cursor `editor.background` */
  canvas: '#181818',
  /** Left sidebar / chrome — Cursor `sideBar.background` (darker than editor) */
  canvasAlt: '#141414',
  canvasMuted: '#2A2A2A',

  surface: '#181818',
  surfaceMuted: 'rgba(24, 24, 24, 0.72)',
  /** Cursor `list.hoverBackground` `#F0F0F011` ≈ 6.7% */
  surfaceHover: 'rgba(240, 240, 240, 0.067)',
  surfaceGlass: 'rgba(24, 24, 24, 0.72)',

  glass: 'rgba(24, 24, 24, 0.45)',
  glassStrong: 'rgba(40, 40, 40, 0.62)',
  /** Cursor `list.activeSelectionBackground` `#F0F0F01E` ≈ 11.8% → 0.12 */
  glassNavSelected: 'rgba(240, 240, 240, 0.12)',

  sidebarGlass: 'rgba(24, 24, 24, 0.45)',
  sidebarSelected: 'rgba(240, 240, 240, 0.12)',

  /** Align with canvas / Composer input card */
  userBubble: '#181818',
  gray100: '#2A2A2A',
  gray200: '#3A3A3A',
  gray300: '#4A4A4A',

  /** Cursor `#F0F0F013` ≈ 7.5% */
  separator: 'rgba(240, 240, 240, 0.075)',
  separatorStrong: 'rgba(240, 240, 240, 0.12)',
  border: 'rgba(240, 240, 240, 0.075)',
  borderStrong: 'rgba(240, 240, 240, 0.15)',

  textPrimary: '#F0F0F0',
  textSecondary: 'rgba(240, 240, 240, 0.74)',
  textTertiary: 'rgba(240, 240, 240, 0.60)',

  success: '#30D158',
  successSoft: 'rgba(48, 209, 88, 0.14)',
  warning: '#FF9F0A',
  warningSoft: 'rgba(255, 159, 10, 0.14)',
  error: '#FF453A',
  errorSoft: 'rgba(255, 69, 58, 0.14)',
  infoSoft: 'rgba(240, 240, 240, 0.06)',

  /** Cursor `input.background` `#F0F0F00A` ≈ 3.9% */
  inputBg: 'rgba(240, 240, 240, 0.039)',
  inputBgHover: 'rgba(240, 240, 240, 0.07)',
  inputBgFocus: 'rgba(240, 240, 240, 0.10)',
  inputBorder: 'transparent',
  /** Cursor `focusBorder` `#F0F0F026` ≈ 15% */
  inputBorderFocus: 'rgba(240, 240, 240, 0.15)',

  focusGlow: '0 0 0 3px rgba(240, 240, 240, 0.12)',
  focusBorder: 'rgba(240, 240, 240, 0.15)',

  composerFloatShadow: '0 1px 4px rgba(0, 0, 0, 0.28), 0 4px 12px rgba(0, 0, 0, 0.22)',
  composerFloatShadowHover: '0 2px 6px rgba(0, 0, 0, 0.32), 0 6px 16px rgba(0, 0, 0, 0.26)',
  composerFloatShadowFocus: '0 2px 8px rgba(0, 0, 0, 0.36), 0 8px 20px rgba(0, 0, 0, 0.30)',

  popoverBorderColor: 'rgba(240, 240, 240, 0.12)',
  popoverShadow: '0 2px 8px rgba(0, 0, 0, 0.32), 0 1px 2px rgba(0, 0, 0, 0.24)',
  glassPanelBorderColor: 'rgba(240, 240, 240, 0.12)',
  glassPanelShadow: '0 1px 2px rgba(0, 0, 0, 0.28), 0 4px 14px rgba(0, 0, 0, 0.32)',
  settingsPanelBorderColor: 'rgba(240, 240, 240, 0.12)',
  glassSurfaceBg: 'rgba(24, 24, 24, 0.72)',
  glassSurfaceBorder: 'rgba(240, 240, 240, 0.12)',

  overlaySidebarHover: 'rgba(240, 240, 240, 0.067)',
  overlaySidebarSelected: 'rgba(240, 240, 240, 0.12)',

  popoverBorder: '1px solid rgba(240, 240, 240, 0.12)',
  glassPanelBorder: '1px solid rgba(240, 240, 240, 0.12)',
  settingsPanelBorder: '1px solid rgba(240, 240, 240, 0.12)',

  beige: '#2A2A2A',
  beigeMuted: '#3A3A3A',
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
  /** 侧栏/顶栏二级标题等发丝分割，弱于 separatorStrong */
  separatorHairline: 'var(--opptrix-separator-hairline)',
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
