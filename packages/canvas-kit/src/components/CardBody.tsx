import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx.js'

export type CardBodyProps = {
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

export function CardBody({ className, style, children }: CardBodyProps) {
  return (
    <div className={cx('oxc-card-body', className)} style={style}>
      {children}
    </div>
  )
}
