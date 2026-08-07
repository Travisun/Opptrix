import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx.js'

export type PillTone = 'default' | 'muted' | 'success' | 'warning' | 'danger' | 'info'
export type PillSize = 'sm' | 'md'

export type PillProps = {
  className?: string
  style?: CSSProperties
  tone?: PillTone
  size?: PillSize
  active?: boolean
  children?: ReactNode
}

/**
 * Neutral status / filter chip. Prefer text labels — no emoji leading glyphs.
 */
export function Pill({
  className,
  style,
  tone = 'default',
  size = 'md',
  active,
  children,
}: PillProps) {
  return (
    <span
      className={cx(
        'oxc-pill',
        size === 'sm' ? 'oxc-pill--sm' : 'oxc-pill--md',
        active && 'oxc-pill--active',
        tone !== 'default' && tone !== 'muted' && `oxc-pill--${tone}`,
        tone === 'muted' && !active && 'oxc-pill--muted',
        className,
      )}
      style={style}
    >
      {children}
    </span>
  )
}
