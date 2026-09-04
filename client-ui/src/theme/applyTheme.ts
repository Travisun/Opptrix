import type { AppearanceType, ColorScheme, ThemePreference } from './tokens'
import { getOpptrixTokens } from './tokens'
import { applyCssVars } from './cssVars'

const THEME_COLOR_META = 'theme-color'
const APPLE_STATUS_BAR_META = 'apple-mobile-web-app-status-bar-style'

/**
 * 页面外壳底（html/body 首屏兜底）— 与 tokens `canvasAlt` / 左侧边栏一致。
 */
export const THEME_CHROME_LIGHT = '#F3F3F3'
export const THEME_CHROME_DARK = '#141414'

/** iOS 设计语言 chrome 底 — grouped background。 */
export const IOS_CHROME_LIGHT = '#F2F2F7'
export const IOS_CHROME_DARK = '#000000'

/**
 * @deprecated 历史「页头纯白」色；Chrome/PWA theme-color 已改对齐侧栏 `canvasAlt`。
 * 保留导出以免外部断引用。
 */
export const THEME_HEADER_LIGHT = '#FFFFFF'
export const THEME_HEADER_DARK = '#181818'

/** @deprecated 使用 getOpptrixTokens(scheme).canvas / THEME_CHROME_* */
export const THEME_CANVAS_LIGHT = THEME_HEADER_LIGHT
export const THEME_CANVAS_DARK = THEME_HEADER_DARK

/** Chrome 已安装应用顶栏 / meta theme-color — 随设计语言 + scheme。 */
function chromeColorForScheme(scheme: ColorScheme, appearance: AppearanceType): string {
  if (appearance === 'ios') {
    return scheme === 'dark' ? IOS_CHROME_DARK : IOS_CHROME_LIGHT
  }
  return getOpptrixTokens(scheme).canvasAlt
}

/**
 * iOS Safari / 独立 PWA：带 media 的 theme-color 在运行时切换常不刷新。
 * 策略：删光后写入「无 media」单条，强制顶栏跟随当前 resolved scheme。
 */
function syncThemeColorMeta(scheme: ColorScheme, appearance: AppearanceType): void {
  const color = chromeColorForScheme(scheme, appearance)
  for (const node of Array.from(document.querySelectorAll(`meta[name="${THEME_COLOR_META}"]`))) {
    node.remove()
  }
  const meta = document.createElement('meta')
  meta.name = THEME_COLOR_META
  meta.content = color
  document.head.appendChild(meta)
}

function syncAppleStatusBar(scheme: ColorScheme): void {
  for (const node of Array.from(document.querySelectorAll(`meta[name="${APPLE_STATUS_BAR_META}"]`))) {
    node.remove()
  }
  const meta = document.createElement('meta')
  meta.name = APPLE_STATUS_BAR_META
  // default=浅色栏；black=深色不透明栏（独立 PWA 切换时需重建 meta）
  meta.content = scheme === 'dark' ? 'black' : 'default'
  document.head.appendChild(meta)
}

export function applyTheme(
  scheme: ColorScheme,
  preference: ThemePreference = 'system',
  appearance: AppearanceType = 'opptrix',
): void {
  const root = document.documentElement
  root.dataset.theme = scheme
  root.dataset.appearance = appearance
  root.style.colorScheme = scheme

  applyCssVars(scheme, appearance, root)
  syncThemeColorMeta(scheme, appearance)
  syncAppleStatusBar(scheme)

  // Electron: sync OS vibrancy/mica with app theme preference (not just resolved scheme).
  window.electronAPI?.setThemeSource?.(preference)
}
