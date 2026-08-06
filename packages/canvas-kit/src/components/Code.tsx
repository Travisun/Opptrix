import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx.js'

export type CodeProps = {
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

/** Inline code fragment. */
export function Code({ className, style, children }: CodeProps) {
  return (
    <code className={cx('oxc-code', className)} style={style}>
      {children}
    </code>
  )
}
