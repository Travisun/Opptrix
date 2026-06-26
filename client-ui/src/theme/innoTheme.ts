import { createLightTheme, type BrandVariants, type Theme } from '@fluentui/react-components'
import { innoTokens } from './tokens.js'

const brand: BrandVariants = {
  10: '#2a1008',
  20: '#441a0f',
  30: '#5c2415',
  40: '#752f1c',
  50: '#8f3a24',
  60: '#a8472f',
  70: '#c15a42',
  80: innoTokens.accent,
  90: '#e0957f',
  100: '#e8b0a0',
  110: '#f0cbc0',
  120: '#f7e5df',
  130: '#faf0ec',
  140: '#fcf6f4',
  150: '#fdf9f7',
  160: '#fffcfb',
}

const base = createLightTheme(brand)

export const innoTheme: Theme = {
  ...base,
  colorNeutralBackground1: innoTokens.canvas,
  colorNeutralBackground2: innoTokens.surface,
  colorNeutralBackground3: innoTokens.surfaceMuted,
  colorNeutralForeground1: innoTokens.textPrimary,
  colorNeutralForeground2: innoTokens.textSecondary,
  colorNeutralForeground3: innoTokens.textTertiary,
  colorNeutralStroke1: innoTokens.separatorStrong,
  colorNeutralStroke2: innoTokens.separator,
  borderRadiusSmall: innoTokens.radiusSm,
  borderRadiusMedium: innoTokens.radiusMd,
  borderRadiusLarge: innoTokens.radiusLg,
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
