import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx.js'

export type GridProps = {
  className?: string
  style?: CSSProperties
  children?: ReactNode
  columns?: number | string
  gap?: number | string
  minChildWidth?: string
}

/**
 * Responsive CSS grid. When `minChildWidth` is set, uses auto-fill columns.
 */
export function Grid({
  className,
  style,
  children,
  columns = 2,
  gap = '16px',
  minChildWidth,
}: GridProps) {
  const template = minChildWidth
    ? `repeat(auto-fill, minmax(${minChildWidth}, 1fr))`
    : typeof columns === 'number'
      ? `repeat(${columns}, minmax(0, 1fr))`
      : columns

  return (
    <div
      className={cx('oxc-grid', className)}
      style={{
        gap,
        gridTemplateColumns: template,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
