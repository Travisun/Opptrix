import {
  createDarkTheme,
  createLightTheme,
  type BrandVariants,
  type Theme,
} from '@fluentui/react-components'
import type { ColorScheme } from './tokens'
import { getOpptrixTokens } from './tokens'

function buildBrandRamp(accent: string, foreground: string): BrandVariants {
  const isLight = accent === '#1D1D1F' || accent.toLowerCase() === '#1d1d1f'
  if (isLight) {
    return {
      10: '#0a0a0a',
      20: '#141414',
      30: '#1d1d1d',
      40: '#262626',
      50: '#303030',
      60: '#3a3a3a',
      70: '#454545',
      80: accent,
      90: '#525252',
      100: '#6e6e6e',
      110: '#8a8a8a',
      120: '#a6a6a6',
      130: '#c2c2c2',
      140: '#dedede',
      150: '#ececec',
      160: '#f5f5f5',
    }
  }
  return {
    10: '#0a0a0a',
    20: '#141414',
    30: '#1c1c1e',
    40: '#2c2c2e',
    50: '#3a3a3c',
    60: '#48484a',
    70: '#636366',
    80: accent,
    90: '#8e8e93',
    100: '#aeaeb2',
    110: '#c7c7cc',
    120: '#d1d1d6',
    130: '#e5e5ea',
    140: '#f2f2f7',
    150: '#f5f5f7',
    160: foreground,
  }
}

function buildOpptrixTheme(scheme: ColorScheme): Theme {
  const t = getOpptrixTokens(scheme)
  const base = scheme === 'dark'
    ? createDarkTheme(buildBrandRamp(t.accent, t.accentForeground))
    : createLightTheme(buildBrandRamp(t.accent, t.accentForeground))

  return {
    ...base,
    colorBrandBackground: t.accent,
    colorBrandBackgroundHover: t.accentHover,
    colorBrandBackgroundPressed: t.accentHover,
    colorBrandForeground1: t.accentForeground,
    colorBrandForeground2: t.accentForeground,
    colorNeutralBackground1: t.canvas,
    colorNeutralBackground2: t.canvasAlt,
    colorNeutralBackground3: t.canvasMuted,
    colorNeutralForeground1: t.textPrimary,
    colorNeutralForeground2: t.textSecondary,
    colorNeutralForeground3: t.textTertiary,
    colorNeutralStroke1: t.separatorStrong,
    colorNeutralStroke2: t.separator,
    borderRadiusSmall: t.radiusSm,
    borderRadiusMedium: t.radiusMd,
    borderRadiusLarge: t.radiusLg,
    fontFamilyBase: '-apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", sans-serif',
    spacingVerticalS: '8px',
    spacingVerticalM: '12px',
    spacingVerticalL: '16px',
    spacingHorizontalM: '12px',
    spacingHorizontalL: '16px',
    shadow2: 'none',
    shadow4: 'none',
    shadow8: 'none',
    shadow16: 'none',
    shadow28: 'none',
    shadow64: 'none',
  }
}

export function getOpptrixFluentTheme(scheme: ColorScheme): Theme {
  return buildOpptrixTheme(scheme)
}

/** @deprecated Use getOpptrixFluentTheme(resolvedScheme) via ThemeProvider */
export const opptrixTheme = buildOpptrixTheme('light')
