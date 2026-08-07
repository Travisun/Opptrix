import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx.js'

export type HeadingProps = {
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

/** Secondary section title. */
export function H2({ className, style, children }: HeadingProps) {
  return (
    <h2 className={cx('oxc-h2', className)} style={style}>
      {children}
    </h2>
  )
}
