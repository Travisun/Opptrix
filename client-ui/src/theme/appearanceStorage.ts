import type { AppearanceType, ThemePreference } from './tokens'

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
  // 移动端默认 iOS 设计语言; 桌面端保持 Opptrix。
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
