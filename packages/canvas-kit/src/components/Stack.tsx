import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx.js'

export type StackProps = {
  className?: string
  style?: CSSProperties
  children?: ReactNode
  gap?: number | string
  align?: CSSProperties['alignItems']
}

/** Vertical flex stack. Prefer for open chapter layouts over nested cards. */
export function Stack({ className, style, children, gap = '16px', align }: StackProps) {
  return (
    <div
      className={cx('oxc-stack', className)}
      style={{ gap, alignItems: align, ...style }}
    >
      {children}
    </div>
  )
}
