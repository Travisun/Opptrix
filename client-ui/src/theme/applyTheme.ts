import type { ColorScheme, ThemePreference } from './tokens'
import { applyCssVars } from './cssVars'

const THEME_COLOR_META = 'theme-color'

export function applyTheme(scheme: ColorScheme, preference: ThemePreference = 'system'): void {
  const root = document.documentElement
  root.dataset.theme = scheme

  applyCssVars(scheme, root)

  const canvas = getComputedStyle(root).getPropertyValue('--opptrix-canvas').trim()
  if (canvas) {
    let meta = document.querySelector<HTMLMetaElement>(`meta[name="${THEME_COLOR_META}"]`)
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = THEME_COLOR_META
      document.head.appendChild(meta)
    }
    meta.content = canvas
  }

  // Electron: sync OS vibrancy/acrylic with app theme preference (not just resolved scheme).
  window.electronAPI?.setThemeSource?.(preference)
}
