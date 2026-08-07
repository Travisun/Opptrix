import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx.js'

export type StatTone = 'success' | 'danger' | 'warning' | 'info'

export type StatProps = {
  className?: string
  style?: CSSProperties
  /** Large metric — rendered above the label. */
  value?: ReactNode
  /** Small caption under the value. */
  label?: ReactNode
  /** Optional tertiary note (compat with older playbooks). */
  hint?: ReactNode
  tone?: StatTone
  children?: ReactNode
}

/** Compact metric: large value on top, small label below. */
export function Stat({
  className,
  style,
  value,
  label,
  hint,
  tone,
  children,
}: StatProps) {
  return (
    <div
      className={cx('oxc-stat', tone && `oxc-stat--${tone}`, className)}
      style={style}
    >
      {value != null ? <div className="oxc-stat__value">{value}</div> : null}
      {label != null ? <div className="oxc-stat__label">{label}</div> : null}
      {hint != null ? <div className="oxc-stat__hint">{hint}</div> : null}
      {children}
    </div>
  )
}
