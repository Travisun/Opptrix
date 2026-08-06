import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx.js'
import { useCanvasTheme, type UseCanvasThemeOptions } from '../useCanvasTheme.js'

export type SurfaceProps = UseCanvasThemeOptions & {
  className?: string
  style?: CSSProperties
  children?: ReactNode
  /** Override max content width (default ~880px via CSS). */
  maxWidth?: number | string
}

/**
 * Top-level fluid container for analysis panels.
 *
 * Design: flat and restrained — no gradients, heavy shadows, or decorative glyphs.
 * Prefer open sections with occasional cards over wrapping every block in Card.
 * Width is fluid (100% / max ~880px), not a fixed paper size. Colors come from
 * useCanvasTheme / semantic tokens only.
 */
export function Surface({
  scheme,
  root,
  className,
  style,
  children,
  maxWidth,
}: SurfaceProps) {
  const theme = useCanvasTheme({ scheme, root })
  return (
    <div
      className={cx('oxc-surface', className)}
      data-theme={theme.scheme}
      style={{
        ...theme.cssVars,
        ...(maxWidth != null ? { maxWidth } : null),
        ...style,
      }}
    >
      {children}
    </div>
  )
}
