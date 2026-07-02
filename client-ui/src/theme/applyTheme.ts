import type { ColorScheme } from './tokens'
import { applyCssVars } from './cssVars'

const THEME_COLOR_META = 'theme-color'

export function applyTheme(scheme: ColorScheme): void {
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

  // Electron native title bar / system chrome (optional)
  const electronApi = (window as Window & { opptrix?: { setThemeSource?: (source: string) => void } }).opptrix
  electronApi?.setThemeSource?.(scheme)
}
