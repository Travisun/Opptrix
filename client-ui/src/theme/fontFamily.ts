export type FontFamilyPreset = 'noto-sans' | 'inter' | 'source-han'

const STORAGE_KEY = 'opptrix-font-family'

/** Custom event so canvas / LWC / Mermaid can refresh after font switch. */
export const OPPTRIX_FONT_FAMILY_CHANGE_EVENT = 'opptrix-font-family-change'

export const FONT_FAMILY_STACKS: Record<FontFamilyPreset, string> = {
  'noto-sans': '"Noto Sans SC", sans-serif',
  inter: '"Inter", "Noto Sans SC", sans-serif',
  'source-han': '"Source Han Sans SC", "Noto Sans SC", sans-serif',
}

export const FONT_MONO_STACK = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

export const FONT_FAMILY_LABELS: Record<FontFamilyPreset, string> = {
  'noto-sans': '清晰黑体',
  inter: '现代无衬线',
  'source-han': '思源黑体',
}

export const FONT_FAMILY_OPTIONS = Object.keys(FONT_FAMILY_STACKS) as FontFamilyPreset[]

const PRESET_SET = new Set<string>(FONT_FAMILY_OPTIONS)

export function readFontFamilyPreference(): FontFamilyPreset {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw && PRESET_SET.has(raw)) return raw as FontFamilyPreset
  return 'noto-sans'
}

export function writeFontFamilyPreference(preset: FontFamilyPreset): void {
  localStorage.setItem(STORAGE_KEY, preset)
}

export function applyFontFamily(preset: FontFamilyPreset): void {
  const root = document.documentElement
  root.style.setProperty('--opptrix-font-sans', FONT_FAMILY_STACKS[preset])
  root.style.setProperty('--opptrix-font-mono', FONT_MONO_STACK)
  root.setAttribute('data-font-family', preset)
  window.dispatchEvent(new CustomEvent(OPPTRIX_FONT_FAMILY_CHANGE_EVENT, { detail: { preset } }))
}

/** Resolve current sans stack from CSS (for canvas / chart that cannot use CSS alone). */
export function resolveSansFontFamily(): string {
  if (typeof document === 'undefined') return FONT_FAMILY_STACKS['noto-sans']
  const v = getComputedStyle(document.documentElement).getPropertyValue('--opptrix-font-sans').trim()
  return v || FONT_FAMILY_STACKS['noto-sans']
}

export function resolveMonoFontFamily(): string {
  if (typeof document === 'undefined') return FONT_MONO_STACK
  const v = getComputedStyle(document.documentElement).getPropertyValue('--opptrix-font-mono').trim()
  return v || FONT_MONO_STACK
}
