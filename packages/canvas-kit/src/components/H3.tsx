import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx.js'

export type HeadingProps = {
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

/** Tertiary heading for subsections. */
export function H3({ className, style, children }: HeadingProps) {
  return (
    <h3 className={cx('oxc-h3', className)} style={style}>
      {children}
    </h3>
  )
}
