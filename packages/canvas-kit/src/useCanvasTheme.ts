import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  getCanvasTokens,
  groupCanvasTokens,
  tokensToCssVars,
  type CanvasColorScheme,
  type CanvasSemanticTokens,
  type CanvasTokenGroups,
} from './theme.js'

export type UseCanvasThemeOptions = {
  /** Explicit scheme; when omitted, reads host `data-theme` (or `prefers-color-scheme`). */
  scheme?: CanvasColorScheme
  /** Element that carries `data-theme`; defaults to `document.documentElement`. */
  root?: HTMLElement | null
}

export type CanvasThemeValue = CanvasTokenGroups & {
  scheme: CanvasColorScheme
  tokens: CanvasSemanticTokens
  /** Ready-to-spread CSS vars for a themed root. */
  cssVars: CSSProperties
}

function readHostScheme(root: HTMLElement | null | undefined): CanvasColorScheme {
  if (typeof document === 'undefined') return 'light'
  const el = root ?? document.documentElement
  const attr = el.getAttribute('data-theme')?.toLowerCase()
  if (attr === 'dark' || attr === 'light') return attr
  const nested = el.querySelector?.('[data-theme]')
  const nestedAttr = nested?.getAttribute('data-theme')?.toLowerCase()
  if (nestedAttr === 'dark' || nestedAttr === 'light') return nestedAttr
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

/**
 * Resolve canvas semantic tokens from props or the host `data-theme`.
 * Prefer this (or CSS vars from Surface) over ad-hoc color literals in components.
 * Grouped fields: `text` / `bg` / `fill` / `stroke` / `accent`.
 */
export function useCanvasTheme(opts: UseCanvasThemeOptions = {}): CanvasThemeValue {
  const { scheme: schemeProp, root } = opts
  const [hostScheme, setHostScheme] = useState<CanvasColorScheme>(() =>
    schemeProp ?? readHostScheme(root),
  )

  useEffect(() => {
    if (schemeProp) {
      setHostScheme(schemeProp)
      return
    }
    const el = root ?? (typeof document !== 'undefined' ? document.documentElement : null)
    if (!el) return

    const sync = () => setHostScheme(readHostScheme(el))
    sync()

    const mo = new MutationObserver(sync)
    mo.observe(el, { attributes: true, attributeFilter: ['data-theme'], subtree: true })

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onMq = () => sync()
    mq.addEventListener('change', onMq)

    return () => {
      mo.disconnect()
      mq.removeEventListener('change', onMq)
    }
  }, [schemeProp, root])

  const scheme = schemeProp ?? hostScheme

  return useMemo(() => {
    const tokens = getCanvasTokens(scheme)
    const vars = tokensToCssVars(tokens)
    const groups = groupCanvasTokens(tokens)
    return {
      scheme,
      tokens,
      cssVars: vars as CSSProperties,
      ...groups,
    }
  }, [scheme])
}
