import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx.js'

export type HeadingProps = {
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

/** Primary section title. Flat typography — no decorative flourishes. */
export function H1({ className, style, children }: HeadingProps) {
  return (
    <h1 className={cx('oxc-h1', className)} style={style}>
      {children}
    </h1>
  )
}
