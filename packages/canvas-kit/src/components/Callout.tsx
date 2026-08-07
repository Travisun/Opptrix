import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx.js'

export type CalloutTone = 'info' | 'success' | 'warning' | 'danger'
export type CalloutVariant = 'soft' | 'outline' | 'bar'
export type CalloutSize = 'sm' | 'md'

export type CalloutProps = {
  className?: string
  style?: CSSProperties
  tone?: CalloutTone
  /** soft = filled tip (default); outline = surface + tone border; bar = accent bar only */
  variant?: CalloutVariant
  size?: CalloutSize
  title?: ReactNode
  children?: ReactNode
}

/** Inline notice — tone bar + title; no emoji icons by default. */
export function Callout({
  className,
  style,
  tone = 'info',
  variant = 'soft',
  size = 'md',
  title,
  children,
}: CalloutProps) {
  return (
    <aside
      className={cx(
        'oxc-callout',
        `oxc-callout--${tone}`,
        variant !== 'soft' && `oxc-callout--${variant}`,
        size === 'sm' && 'oxc-callout--sm',
        className,
      )}
      style={style}
    >
      <span className="oxc-callout__mark" aria-hidden="true" />
      <div className="oxc-callout__content">
        {title != null ? <p className="oxc-callout__title">{title}</p> : null}
        {children != null ? <div className="oxc-callout__body">{children}</div> : null}
      </div>
    </aside>
  )
}
