import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx.js'

export type QuoteTone = 'default' | 'muted' | 'accent' | 'info'
export type QuoteSize = 'sm' | 'md'

export type QuoteProps = {
  className?: string
  style?: CSSProperties
  tone?: QuoteTone
  /** Source line under the excerpt, e.g.「出处 · 年报」 */
  cite?: ReactNode
  children?: ReactNode
  size?: QuoteSize
}

/**
 * Block quote / excerpt for report prose (source lines, 口径摘录).
 * Prefer Quote for citations; use Callout for tips / risk notices.
 */
export function Quote({
  className,
  style,
  tone = 'default',
  cite,
  children,
  size = 'md',
}: QuoteProps) {
  return (
    <blockquote
      className={cx(
        'oxc-quote',
        tone !== 'default' && `oxc-quote--${tone}`,
        size === 'sm' && 'oxc-quote--sm',
        className,
      )}
      style={style}
    >
      {children != null ? <div className="oxc-quote__body">{children}</div> : null}
      {cite != null ? <footer className="oxc-quote__cite">{cite}</footer> : null}
    </blockquote>
  )
}
