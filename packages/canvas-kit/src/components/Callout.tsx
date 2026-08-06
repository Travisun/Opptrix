import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx.js'

export type CalloutTone = 'info' | 'success' | 'warning' | 'danger'

export type CalloutProps = {
  className?: string
  style?: CSSProperties
  tone?: CalloutTone
  title?: ReactNode
  children?: ReactNode
}

/** Inline notice — tone bar + title; no emoji icons by default. */
export function Callout({
  className,
  style,
  tone = 'info',
  title,
  children,
}: CalloutProps) {
  return (
    <aside className={cx('oxc-callout', `oxc-callout--${tone}`, className)} style={style}>
      <span className="oxc-callout__mark" aria-hidden="true" />
      <div>
        {title != null ? <p className="oxc-callout__title">{title}</p> : null}
        {children != null ? <div className="oxc-callout__body">{children}</div> : null}
      </div>
    </aside>
  )
}
