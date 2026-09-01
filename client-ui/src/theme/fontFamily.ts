import { electronPlatform, isElectron } from '../platform/detect'

/** UI font presets — system fonts only; no webfont download. */
export type FontFamilyPreset = 'system' | 'hei' | 'song'

/** Coarse UI platform for CJK / Latin system stacks. */
export type FontUiPlatform = 'apple' | 'windows' | 'android' | 'linux' | 'unknown'

const STORAGE_KEY = 'opptrix-font-family'

/** Custom event so canvas / LWC / Mermaid can refresh after font switch. */
export const OPPTRIX_FONT_FAMILY_CHANGE_EVENT = 'opptrix-font-family-change'

export const FONT_FAMILY_LABELS: Record<FontFamilyPreset, string> = {
  system: '跟随系统',
  hei: '黑体优先',
  song: '宋体阅读',
}

export const FONT_FAMILY_OPTIONS = Object.keys(FONT_FAMILY_LABELS) as FontFamilyPreset[]

const PRESET_SET = new Set<string>(FONT_FAMILY_OPTIONS)

/** Map retired webfont presets → system presets. */
const LEGACY_PRESET_MAP: Record<string, FontFamilyPreset> = {
  inter: 'system',
  'noto-sans': 'hei',
  'source-han': 'hei',
}

const SYSTEM_MONO =
  'ui-monospace, "SF Mono", Menlo, "Cascadia Mono", "Cascadia Code", "Segoe UI Mono", Consolas, "Liberation Mono", monospace'

const SANS_BY_PLATFORM: Record<FontUiPlatform, Record<FontFamilyPreset, string>> = {
  apple: {
    system:
      '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Heiti SC", "Helvetica Neue", sans-serif',
    hei: '"PingFang SC", "Hiragino Sans GB", "Heiti SC", -apple-system, BlinkMacSystemFont, sans-serif',
    song: '"Songti SC", "STSong", "SimSun", "PingFang SC", serif',
  },
  windows: {
    system:
      '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif',
    hei: '"Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif',
    song: 'SimSun, NSimSun, "Songti SC", "Microsoft YaHei", serif',
  },
  android: {
    system:
      'system-ui, Roboto, "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", sans-serif',
    hei: '"Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", Roboto, system-ui, sans-serif',
    song: '"Noto Serif CJK SC", "Noto Serif SC", "Songti SC", serif',
  },
  linux: {
    system:
      'system-ui, "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", "WenQuanYi Micro Hei", "DejaVu Sans", sans-serif',
    hei: '"Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", "WenQuanYi Micro Hei", system-ui, sans-serif',
    song: '"Noto Serif CJK SC", "Source Han Serif SC", "AR PL UMing CN", serif',
  },
  unknown: {
    system:
      'system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei UI", "Noto Sans CJK SC", "Helvetica Neue", Arial, sans-serif',
    hei: '"PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", system-ui, sans-serif',
    song: '"Songti SC", SimSun, "Noto Serif CJK SC", serif',
  },
}

export function detectFontUiPlatform(): FontUiPlatform {
  if (typeof window === 'undefined') return 'unknown'

  if (isElectron()) {
    const p = electronPlatform()
    if (p === 'darwin') return 'apple'
    if (p === 'win32') return 'windows'
    if (p === 'linux') return 'linux'
  }

  const ua = navigator.userAgent || ''
  const platform = navigator.platform || ''

  if (/Android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'apple'
  if (/Macintosh|Mac OS X/i.test(ua) || /Mac/i.test(platform)) return 'apple'
  if (/Win/i.test(platform) || /Windows/i.test(ua)) return 'windows'
  if (/Linux/i.test(ua) || /Linux/i.test(platform)) return 'linux'

  const uaData = (
    navigator as Navigator & {
      userAgentData?: { platform?: string; mobile?: boolean }
    }
  ).userAgentData
  const uaPlat = uaData?.platform?.toLowerCase() ?? ''
  if (uaPlat.includes('android')) return 'android'
  if (uaPlat.includes('mac') || uaPlat.includes('ios')) return 'apple'
  if (uaPlat.includes('win')) return 'windows'
  if (uaPlat.includes('linux')) return 'linux'

  return 'unknown'
}

export function resolveFontFamilyStack(
  preset: FontFamilyPreset,
  platform: FontUiPlatform = detectFontUiPlatform(),
): string {
  return SANS_BY_PLATFORM[platform][preset]
}

export function resolveMonoFontStack(): string {
  return SYSTEM_MONO
}

/** @deprecated Prefer resolveFontFamilyStack — kept for chart callers that expect a constant map shape */
export const FONT_MONO_STACK = SYSTEM_MONO

export function readFontFamilyPreference(): FontFamilyPreset {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return 'system'
  if (PRESET_SET.has(raw)) return raw as FontFamilyPreset
  const migrated = LEGACY_PRESET_MAP[raw]
  if (migrated) {
    try {
      localStorage.setItem(STORAGE_KEY, migrated)
    } catch {
      /* ignore quota */
    }
    return migrated
  }
  return 'system'
}

export function writeFontFamilyPreference(preset: FontFamilyPreset): void {
  localStorage.setItem(STORAGE_KEY, preset)
}

export function applyFontFamily(preset: FontFamilyPreset): void {
  const platform = detectFontUiPlatform()
  const root = document.documentElement
  root.style.setProperty('--opptrix-font-sans', resolveFontFamilyStack(preset, platform))
  root.style.setProperty('--opptrix-font-mono', SYSTEM_MONO)
  root.setAttribute('data-font-family', preset)
  root.setAttribute('data-font-platform', platform)
  window.dispatchEvent(
    new CustomEvent(OPPTRIX_FONT_FAMILY_CHANGE_EVENT, { detail: { preset, platform } }),
  )
}

/** Resolve current sans stack from CSS (for canvas / chart that cannot use CSS alone). */
export function resolveSansFontFamily(): string {
  if (typeof document === 'undefined') {
    return resolveFontFamilyStack('system', 'unknown')
  }
  const v = getComputedStyle(document.documentElement).getPropertyValue('--opptrix-font-sans').trim()
  return v || resolveFontFamilyStack('system')
}

export function resolveMonoFontFamily(): string {
  if (typeof document === 'undefined') return SYSTEM_MONO
  const v = getComputedStyle(document.documentElement).getPropertyValue('--opptrix-font-mono').trim()
  return v || SYSTEM_MONO
}
