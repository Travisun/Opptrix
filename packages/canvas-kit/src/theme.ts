/**
 * Canvas palette + type/spacing scales.
 * Single source for @opptrix/canvas semantic tokens (self-contained).
 */

export type CanvasColorScheme = 'light' | 'dark'

/** Type roles — pixel sizes match the panel design spec. */
export type CanvasTypeScale = {
  h1: { fontSize: string; lineHeight: string; fontWeight: number }
  h2: { fontSize: string; lineHeight: string; fontWeight: number }
  h3: { fontSize: string; lineHeight: string; fontWeight: number }
  body: { fontSize: string; lineHeight: string; fontWeight: number }
  small: { fontSize: string; lineHeight: string; fontWeight: number }
}

export const canvasTypeScale: CanvasTypeScale = {
  h1: { fontSize: '24px', lineHeight: '30px', fontWeight: 590 },
  h2: { fontSize: '18px', lineHeight: '24px', fontWeight: 590 },
  h3: { fontSize: '16px', lineHeight: '22px', fontWeight: 590 },
  body: { fontSize: '14px', lineHeight: '20px', fontWeight: 400 },
  small: { fontSize: '12px', lineHeight: '16px', fontWeight: 400 },
}

/** Spacing steps (px) → CSS custom property suffixes. */
export const canvasSpaceScale = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40] as const

/** Corner radii (px); 9999 = pill. */
export const canvasRadiusScale = [0, 2, 4, 6, 8, 12, 9999] as const

export type CanvasSemanticTokens = {
  accent: string
  accentHover: string
  accentSoft: string
  accentMuted: string
  accentForeground: string

  bg: string
  bgAlt: string
  bgMuted: string
  bgChrome: string

  surface: string
  surfaceMuted: string
  surfaceElevated: string

  border: string
  borderStrong: string
  separator: string

  text: string
  textSecondary: string
  textTertiary: string

  success: string
  successSoft: string
  warning: string
  warningSoft: string
  danger: string
  dangerSoft: string
  info: string
  infoSoft: string

  fillSubtle: string
  fillMuted: string
  fillStrong: string

  chart1: string
  chart2: string
  chart3: string
  chart4: string
  chart5: string

  radiusNone: string
  radiusXs: string
  radiusSm: string
  radiusMd: string
  radiusLg: string
  radiusXl: string
  radiusPill: string

  space2: string
  space4: string
  space6: string
  space8: string
  space10: string
  space12: string
  space14: string
  space16: string
  space18: string
  space20: string
  space24: string
  space28: string
  space32: string
  space36: string
  space40: string

  /** Legacy aliases used by older CSS class rules. */
  spaceXs: string
  spaceSm: string
  spaceMd: string
  spaceLg: string
  spaceXl: string

  fontSans: string
  fontMono: string

  typeH1Size: string
  typeH1Line: string
  typeH1Weight: string
  typeH2Size: string
  typeH2Line: string
  typeH2Weight: string
  typeH3Size: string
  typeH3Line: string
  typeH3Weight: string
  typeBodySize: string
  typeBodyLine: string
  typeBodyWeight: string
  typeSmallSize: string
  typeSmallLine: string
  typeSmallWeight: string
}

/** Grouped token views for inline style / JS consumers. */
export type CanvasTokenGroups = {
  text: {
    primary: string
    secondary: string
    tertiary: string
  }
  bg: {
    chrome: string
    base: string
    alt: string
    muted: string
    surface: string
    surfaceMuted: string
    elevated: string
  }
  fill: {
    subtle: string
    muted: string
    strong: string
    accentSoft: string
    successSoft: string
    warningSoft: string
    dangerSoft: string
    infoSoft: string
  }
  stroke: {
    default: string
    strong: string
    separator: string
  }
  accent: {
    default: string
    hover: string
    soft: string
    muted: string
    foreground: string
  }
}

const FONT_SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'

function withTypeAndSpace(
  partial: Omit<
    CanvasSemanticTokens,
    | 'space2'
    | 'space4'
    | 'space6'
    | 'space8'
    | 'space10'
    | 'space12'
    | 'space14'
    | 'space16'
    | 'space18'
    | 'space20'
    | 'space24'
    | 'space28'
    | 'space32'
    | 'space36'
    | 'space40'
    | 'spaceXs'
    | 'spaceSm'
    | 'spaceMd'
    | 'spaceLg'
    | 'spaceXl'
    | 'radiusNone'
    | 'radiusXs'
    | 'radiusSm'
    | 'radiusMd'
    | 'radiusLg'
    | 'radiusXl'
    | 'radiusPill'
    | 'typeH1Size'
    | 'typeH1Line'
    | 'typeH1Weight'
    | 'typeH2Size'
    | 'typeH2Line'
    | 'typeH2Weight'
    | 'typeH3Size'
    | 'typeH3Line'
    | 'typeH3Weight'
    | 'typeBodySize'
    | 'typeBodyLine'
    | 'typeBodyWeight'
    | 'typeSmallSize'
    | 'typeSmallLine'
    | 'typeSmallWeight'
    | 'fontSans'
    | 'fontMono'
  >,
): CanvasSemanticTokens {
  const t = canvasTypeScale
  return {
    ...partial,
    radiusNone: '0px',
    radiusXs: '2px',
    radiusSm: '4px',
    radiusMd: '6px',
    radiusLg: '8px',
    radiusXl: '12px',
    radiusPill: '9999px',

    space2: '2px',
    space4: '4px',
    space6: '6px',
    space8: '8px',
    space10: '10px',
    space12: '12px',
    space14: '14px',
    space16: '16px',
    space18: '18px',
    space20: '20px',
    space24: '24px',
    space28: '28px',
    space32: '32px',
    space36: '36px',
    space40: '40px',

    spaceXs: '4px',
    spaceSm: '8px',
    spaceMd: '16px',
    spaceLg: '24px',
    spaceXl: '32px',

    fontSans: FONT_SANS,
    fontMono: FONT_MONO,

    typeH1Size: t.h1.fontSize,
    typeH1Line: t.h1.lineHeight,
    typeH1Weight: String(t.h1.fontWeight),
    typeH2Size: t.h2.fontSize,
    typeH2Line: t.h2.lineHeight,
    typeH2Weight: String(t.h2.fontWeight),
    typeH3Size: t.h3.fontSize,
    typeH3Line: t.h3.lineHeight,
    typeH3Weight: String(t.h3.fontWeight),
    typeBodySize: t.body.fontSize,
    typeBodyLine: t.body.lineHeight,
    typeBodyWeight: String(t.body.fontWeight),
    typeSmallSize: t.small.fontSize,
    typeSmallLine: t.small.lineHeight,
    typeSmallWeight: String(t.small.fontWeight),
  }
}

/** Light panel — pure white paper, deep ink, blue emphasis (~#3685BF). */
export const canvasTokensLight: CanvasSemanticTokens = withTypeAndSpace({
  accent: '#3685BF',
  accentHover: '#2A6FA3',
  accentSoft: 'rgba(54, 133, 191, 0.12)',
  accentMuted: 'rgba(54, 133, 191, 0.22)',
  accentForeground: '#FFFFFF',

  bg: '#FFFFFF',
  bgAlt: '#FFFFFF',
  bgMuted: '#EEEEF0',
  bgChrome: '#F0F0F2',

  surface: '#FFFFFF',
  surfaceMuted: '#F7F7F8',
  surfaceElevated: '#FFFFFF',

  border: 'rgba(15, 15, 20, 0.10)',
  borderStrong: 'rgba(15, 15, 20, 0.18)',
  separator: 'rgba(15, 15, 20, 0.08)',

  text: 'rgba(15, 15, 20, 0.92)',
  textSecondary: 'rgba(15, 15, 20, 0.62)',
  textTertiary: 'rgba(15, 15, 20, 0.42)',

  success: '#2E9E5B',
  successSoft: 'rgba(46, 158, 91, 0.12)',
  warning: '#C47D12',
  warningSoft: 'rgba(196, 125, 18, 0.12)',
  danger: '#D1433B',
  dangerSoft: 'rgba(209, 67, 59, 0.12)',
  info: '#3685BF',
  infoSoft: 'rgba(54, 133, 191, 0.10)',

  fillSubtle: 'rgba(15, 15, 20, 0.04)',
  fillMuted: 'rgba(15, 15, 20, 0.07)',
  fillStrong: 'rgba(15, 15, 20, 0.12)',

  chart1: '#3685BF',
  chart2: 'rgba(15, 15, 20, 0.55)',
  chart3: '#2E9E5B',
  chart4: '#C47D12',
  chart5: '#8B5CF6',
})

/** Dark panel — near-black chrome, translucent gray ink, blue emphasis (~#599CE7). */
export const canvasTokensDark: CanvasSemanticTokens = withTypeAndSpace({
  accent: '#599CE7',
  accentHover: '#7AB0ED',
  accentSoft: 'rgba(89, 156, 231, 0.16)',
  accentMuted: 'rgba(89, 156, 231, 0.28)',
  accentForeground: '#0B1220',

  bg: '#141416',
  bgAlt: '#1A1A1D',
  bgMuted: '#222226',
  bgChrome: '#101012',

  surface: '#1A1A1D',
  surfaceMuted: '#222226',
  surfaceElevated: '#242428',

  border: 'rgba(255, 255, 255, 0.09)',
  borderStrong: 'rgba(255, 255, 255, 0.16)',
  separator: 'rgba(255, 255, 255, 0.08)',

  text: 'rgba(255, 255, 255, 0.92)',
  textSecondary: 'rgba(255, 255, 255, 0.62)',
  textTertiary: 'rgba(255, 255, 255, 0.40)',

  success: '#3DCF7A',
  successSoft: 'rgba(61, 207, 122, 0.16)',
  warning: '#E0A03A',
  warningSoft: 'rgba(224, 160, 58, 0.16)',
  danger: '#F07167',
  dangerSoft: 'rgba(240, 113, 103, 0.16)',
  info: '#599CE7',
  infoSoft: 'rgba(89, 156, 231, 0.14)',

  fillSubtle: 'rgba(255, 255, 255, 0.04)',
  fillMuted: 'rgba(255, 255, 255, 0.07)',
  fillStrong: 'rgba(255, 255, 255, 0.12)',

  chart1: '#599CE7',
  chart2: 'rgba(255, 255, 255, 0.55)',
  chart3: '#3DCF7A',
  chart4: '#E0A03A',
  chart5: '#A78BFA',
})

export function getCanvasTokens(scheme: CanvasColorScheme): CanvasSemanticTokens {
  return scheme === 'dark' ? canvasTokensDark : canvasTokensLight
}

export function groupCanvasTokens(tokens: CanvasSemanticTokens): CanvasTokenGroups {
  return {
    text: {
      primary: tokens.text,
      secondary: tokens.textSecondary,
      tertiary: tokens.textTertiary,
    },
    bg: {
      chrome: tokens.bgChrome,
      base: tokens.bg,
      alt: tokens.bgAlt,
      muted: tokens.bgMuted,
      surface: tokens.surface,
      surfaceMuted: tokens.surfaceMuted,
      elevated: tokens.surfaceElevated,
    },
    fill: {
      subtle: tokens.fillSubtle,
      muted: tokens.fillMuted,
      strong: tokens.fillStrong,
      accentSoft: tokens.accentSoft,
      successSoft: tokens.successSoft,
      warningSoft: tokens.warningSoft,
      dangerSoft: tokens.dangerSoft,
      infoSoft: tokens.infoSoft,
    },
    stroke: {
      default: tokens.border,
      strong: tokens.borderStrong,
      separator: tokens.separator,
    },
    accent: {
      default: tokens.accent,
      hover: tokens.accentHover,
      soft: tokens.accentSoft,
      muted: tokens.accentMuted,
      foreground: tokens.accentForeground,
    },
  }
}

/** Map semantic tokens to CSS custom properties (`--oxc-*`). */
export function tokensToCssVars(tokens: CanvasSemanticTokens): Record<string, string> {
  return {
    '--oxc-accent': tokens.accent,
    '--oxc-accent-hover': tokens.accentHover,
    '--oxc-accent-soft': tokens.accentSoft,
    '--oxc-accent-muted': tokens.accentMuted,
    '--oxc-accent-fg': tokens.accentForeground,
    '--oxc-bg': tokens.bg,
    '--oxc-bg-alt': tokens.bgAlt,
    '--oxc-bg-muted': tokens.bgMuted,
    '--oxc-bg-chrome': tokens.bgChrome,
    '--oxc-surface': tokens.surface,
    '--oxc-surface-muted': tokens.surfaceMuted,
    '--oxc-surface-elevated': tokens.surfaceElevated,
    '--oxc-border': tokens.border,
    '--oxc-border-strong': tokens.borderStrong,
    '--oxc-separator': tokens.separator,
    '--oxc-text': tokens.text,
    '--oxc-text-secondary': tokens.textSecondary,
    '--oxc-text-tertiary': tokens.textTertiary,
    '--oxc-success': tokens.success,
    '--oxc-success-soft': tokens.successSoft,
    '--oxc-warning': tokens.warning,
    '--oxc-warning-soft': tokens.warningSoft,
    '--oxc-danger': tokens.danger,
    '--oxc-danger-soft': tokens.dangerSoft,
    '--oxc-info': tokens.info,
    '--oxc-info-soft': tokens.infoSoft,
    '--oxc-fill-subtle': tokens.fillSubtle,
    '--oxc-fill-muted': tokens.fillMuted,
    '--oxc-fill-strong': tokens.fillStrong,
    '--oxc-chart-1': tokens.chart1,
    '--oxc-chart-2': tokens.chart2,
    '--oxc-chart-3': tokens.chart3,
    '--oxc-chart-4': tokens.chart4,
    '--oxc-chart-5': tokens.chart5,
    '--oxc-radius-none': tokens.radiusNone,
    '--oxc-radius-xs': tokens.radiusXs,
    '--oxc-radius-sm': tokens.radiusSm,
    '--oxc-radius-md': tokens.radiusMd,
    '--oxc-radius-lg': tokens.radiusLg,
    '--oxc-radius-xl': tokens.radiusXl,
    '--oxc-radius-pill': tokens.radiusPill,
    '--oxc-space-2': tokens.space2,
    '--oxc-space-4': tokens.space4,
    '--oxc-space-6': tokens.space6,
    '--oxc-space-8': tokens.space8,
    '--oxc-space-10': tokens.space10,
    '--oxc-space-12': tokens.space12,
    '--oxc-space-14': tokens.space14,
    '--oxc-space-16': tokens.space16,
    '--oxc-space-18': tokens.space18,
    '--oxc-space-20': tokens.space20,
    '--oxc-space-24': tokens.space24,
    '--oxc-space-28': tokens.space28,
    '--oxc-space-32': tokens.space32,
    '--oxc-space-36': tokens.space36,
    '--oxc-space-40': tokens.space40,
    '--oxc-space-xs': tokens.spaceXs,
    '--oxc-space-sm': tokens.spaceSm,
    '--oxc-space-md': tokens.spaceMd,
    '--oxc-space-lg': tokens.spaceLg,
    '--oxc-space-xl': tokens.spaceXl,
    '--oxc-font-sans': tokens.fontSans,
    '--oxc-font-mono': tokens.fontMono,
    '--oxc-type-h1-size': tokens.typeH1Size,
    '--oxc-type-h1-line': tokens.typeH1Line,
    '--oxc-type-h1-weight': tokens.typeH1Weight,
    '--oxc-type-h2-size': tokens.typeH2Size,
    '--oxc-type-h2-line': tokens.typeH2Line,
    '--oxc-type-h2-weight': tokens.typeH2Weight,
    '--oxc-type-h3-size': tokens.typeH3Size,
    '--oxc-type-h3-line': tokens.typeH3Line,
    '--oxc-type-h3-weight': tokens.typeH3Weight,
    '--oxc-type-body-size': tokens.typeBodySize,
    '--oxc-type-body-line': tokens.typeBodyLine,
    '--oxc-type-body-weight': tokens.typeBodyWeight,
    '--oxc-type-small-size': tokens.typeSmallSize,
    '--oxc-type-small-line': tokens.typeSmallLine,
    '--oxc-type-small-weight': tokens.typeSmallWeight,
  }
}
