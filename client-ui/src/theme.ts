import { createDarkTheme, webDarkTheme, type Theme } from '@fluentui/react-components'

// Compact + no-lines theme overrides
const noLinesOverrides: Partial<Theme> = {
  // ── Zero strokes everywhere ──
  strokeWidthThin: '0px',
  strokeWidthThick: '0px',
  strokeWidthThickest: '0px',
  
  // ── Zero border radius ──
  borderRadiusNone: '0px',
  borderRadiusSmall: '0px',
  borderRadiusMedium: '0px',
  borderRadiusLarge: '0px',
  borderRadiusXLarge: '0px',
  
  // ── Compact spacing ──
  spacingVerticalNone: '0px',
  spacingVerticalXXS: '1px',
  spacingVerticalXS: '2px',
  spacingVerticalSNudge: '3px',
  spacingVerticalS: '4px',
  spacingVerticalMNudge: '6px',
  spacingVerticalM: '8px',
  spacingVerticalL: '12px',
  spacingHorizontalNone: '0px',
  spacingHorizontalXXS: '2px',
  spacingHorizontalXS: '4px',
  spacingHorizontalSNudge: '6px',
  spacingHorizontalS: '8px',
  spacingHorizontalMNudge: '10px',
  spacingHorizontalM: '12px',
  spacingHorizontalL: '16px',

  // ── Compact font sizes ──
  fontSizeBase100: '11px',
  fontSizeBase200: '11px',
  fontSizeBase300: '12px',
  fontSizeBase400: '13px',
  fontSizeBase500: '14px',
  fontSizeBase600: '16px',

  // ── Line heights ──
  lineHeightBase100: '14px',
  lineHeightBase200: '14px',
  lineHeightBase300: '16px',
  lineHeightBase400: '18px',
  lineHeightBase500: '20px',
  lineHeightBase600: '22px',
}

// Background color adjustments for no-lines visual separation
noLinesOverrides.colorNeutralBackground1 = '#161616'
noLinesOverrides.colorNeutralBackground2 = '#1e1e1e'
noLinesOverrides.colorNeutralBackground3 = '#252525'
noLinesOverrides.colorSubtleBackground = '#1a1a1a'

export const noLinesTheme: Theme = createDarkTheme({
  ...webDarkTheme,
  ...noLinesOverrides,
})
