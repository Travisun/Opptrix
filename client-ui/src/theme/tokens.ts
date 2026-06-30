/**
 * Codex Agent UI — monochrome palette
 * Black / white / gray, frosted glass, flat surfaces (no shadow)
 */
export const opptrixTokens = {
  /** Primary actions, active indicators */
  accent: '#1D1D1F',
  accentHover: '#000000',
  accentSoft: 'rgba(29, 29, 31, 0.07)',
  accentMuted: '#E5E5EA',

  canvas: '#FFFFFF',
  canvasAlt: '#F5F5F7',
  canvasMuted: '#EBEBED',

  surface: '#FFFFFF',
  surfaceMuted: 'rgba(255, 255, 255, 0.42)',
  surfaceHover: 'rgba(255, 255, 255, 0.62)',
  surfaceGlass: 'rgba(255, 255, 255, 0.72)',

  /** Frosted sidebar / nav over transparent desktop */
  glass: 'rgba(255, 255, 255, 0.14)',
  glassStrong: 'rgba(255, 255, 255, 0.22)',
  glassBlur: 'blur(28px) saturate(200%)',
  glassNavSelected: 'rgba(255, 255, 255, 0.38)',

  sidebarGlass: 'rgba(255, 255, 255, 0.14)',
  sidebarGlassBlur: 'blur(28px) saturate(200%)',
  sidebarSelected: 'rgba(255, 255, 255, 0.38)',

  userBubble: '#F2F2F7',
  gray100: '#F2F2F7',
  gray200: '#E5E5EA',
  gray300: '#D1D1D6',

  separator: 'rgba(60, 60, 67, 0.06)',
  separatorStrong: 'rgba(60, 60, 67, 0.11)',
  border: 'rgba(60, 60, 67, 0.08)',
  borderStrong: 'rgba(60, 60, 67, 0.14)',

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

  /** Unified focus ring (keyboard) */
  focusRingWidth: '2px',
  focusRingOffset: '2px',
  focusGlow: '0 0 0 3px rgba(29, 29, 31, 0.10)',
  focusBorder: 'rgba(60, 60, 67, 0.18)',
  activeOpacity: 0.72,

  sidebarWidth: '228px',
  sidebarWidthPx: 228,
  settingsSidebarWidth: '210px',
  settingsSidebarWidthPx: 210,
  /** Share of the right pane used by settings content (centered, capped by max). */
  settingsContentWidth: '68%',
  settingsContentMaxWidth: '720px',
  windowInset: '6px',
  mobileDrawerWidth: 'min(88vw, 272px)',
  panelWidth: '380px',

  /** Chat thread column — messages + composer share width */
  chatThreadMaxWidth: '820px',
  /** Horizontal edge gutter (narrow windows) */
  chatThreadPaddingX: '15px',
  chatThreadPaddingXMobile: '15px',
  /** Composer panel interior padding */
  chatComposerPadding: '12px',
  /** Gap between composer shell and window bottom */
  chatComposerBottomInset: '25px',
  chatComposerBottomInsetPx: 25,
  /** Parent ground extends below panel toward window bottom (negative margin pull) */
  chatComposerGroundExtend: '10px',
  /** Scroll padding so last message clears the composer dock (+ disclaimer row in panel) */
  chatThreadScrollPadBottom: '212px',
  chatThreadScrollPadBottomMobile: '196px',
  /** @deprecated use chatThreadPaddingX */
  chatThreadAlignInset: '3px',

  radiusSm: '6px',
  radiusMd: '10px',
  radiusLg: '14px',
  radiusXl: '18px',
  radiusFull: '999px',
  radiusGrouped: '12px',

  /** Subtle lift on the composer input shell only */
  composerFloatShadow: '0 1px 4px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 0, 0, 0.04)',
  composerFloatShadowHover: '0 2px 6px rgba(0, 0, 0, 0.07), 0 6px 16px rgba(0, 0, 0, 0.05)',
  composerFloatShadowFocus: '0 2px 8px rgba(0, 0, 0, 0.08), 0 8px 20px rgba(0, 0, 0, 0.06)',
  shadowPanel: 'none',
  shadowSelected: 'none',
  popoverBorder: '1px solid rgba(60, 60, 67, 0.14)',
  popoverShadow: '0 2px 8px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03)',
  settingsPanelBorder: '1px solid #E5E5EA',

  /** @deprecated use gray100 */
  beige: '#F2F2F7',
  /** @deprecated use gray200 */
  beigeMuted: '#E5E5EA',
} as const
