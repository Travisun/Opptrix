import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx.js'

export type RowProps = {
  className?: string
  style?: CSSProperties
  children?: ReactNode
  gap?: number | string
  align?: CSSProperties['alignItems']
  justify?: CSSProperties['justifyContent']
  wrap?: boolean
}

/** Horizontal flex row. */
export function Row({
  className,
  style,
  children,
  gap = '12px',
  align = 'center',
  justify,
  wrap = true,
}: RowProps) {
  return (
    <div
      className={cx('oxc-row', className)}
      style={{
        gap,
        alignItems: align,
        justifyContent: justify,
        flexWrap: wrap ? 'wrap' : 'nowrap',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
