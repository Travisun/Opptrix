import type { AppearanceType, ThemePreference } from './tokens'

const STORAGE_KEY = 'opptrix-theme-preference'

export function readThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    /* ignore */
  }
  return 'system'
}

export function writeThemePreference(preference: ThemePreference): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    /* ignore */
  }
}

export function resolveColorScheme(
  preference: ThemePreference,
  prefersDark = false,
): 'light' | 'dark' {
  if (preference === 'dark') return 'dark'
  if (preference === 'light') return 'light'
  return prefersDark ? 'dark' : 'light'
}

export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false
}

const APPEARANCE_KEY = 'opptrix-appearance-preference'

export type AppearancePreference = AppearanceType

export function readAppearancePreference(): AppearanceType {
  if (typeof window === 'undefined') return 'opptrix'
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY)
    if (raw === 'ios' || raw === 'opptrix') return raw
  } catch {
    /* ignore */
  }
  // mobile defaults to iOS design language; desktop keeps Opptrix
  const mobile = window.matchMedia?.('(max-width: 767px)')?.matches ?? false
  return mobile ? 'ios' : 'opptrix'
}

export function writeAppearancePreference(a: AppearanceType): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(APPEARANCE_KEY, a)
  } catch {
    /* ignore */
  }
}
