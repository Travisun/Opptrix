import { FONT_SCALES, type FontScaleName } from './tokens'
export type { FontScaleName }

const STORAGE_KEY = 'opptrix-font-scale'

export function readFontScalePreference(): FontScaleName {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw && raw in FONT_SCALES) return raw as FontScaleName
  return 'default'
}

export function writeFontScalePreference(name: FontScaleName): void {
  localStorage.setItem(STORAGE_KEY, name)
}

export function applyFontScale(name: FontScaleName): void {
  const scale = FONT_SCALES[name]
  const root = document.documentElement
  root.style.setProperty('--opptrix-font-xs', scale.xs)
  root.style.setProperty('--opptrix-font-sm', scale.sm)
  root.style.setProperty('--opptrix-font-md', scale.md)
  root.style.setProperty('--opptrix-font-base', scale.base)
  root.style.setProperty('--opptrix-font-lg', scale.lg)
  root.style.setProperty('--opptrix-font-xl', scale.xl)
  root.style.setProperty('--opptrix-font-2xl', scale.xxl)
  root.style.setProperty('--opptrix-font-3xl', scale['3xl'])
  root.style.setProperty('--opptrix-font-4xl', scale['4xl'])
  root.style.setProperty('--opptrix-font-display', scale.display)
}

export const FONT_SCALE_LABELS: Record<FontScaleName, string> = {
  compact: '紧凑',
  default: '默认',
  large: '较大',
  xlarge: '超大',
}

export const FONT_SCALE_OPTIONS = Object.keys(FONT_SCALES) as FontScaleName[]
