import type { CSSProperties } from 'react'
import { cx } from '../cx.js'

export type SpacerProps = {
  className?: string
  style?: CSSProperties
  /** Fixed size when not flex-growing; omit to fill remaining space in a Row/Stack. */
  size?: number | string
  axis?: 'x' | 'y' | 'both'
}

/** Flexible or fixed spacer between layout children. */
export function Spacer({ className, style, size, axis = 'both' }: SpacerProps) {
  const fixed: CSSProperties = {}
  if (size != null) {
    if (axis === 'x' || axis === 'both') fixed.width = size
    if (axis === 'y' || axis === 'both') fixed.height = size
    fixed.flex = '0 0 auto'
  }
  return <div className={cx('oxc-spacer', className)} style={{ ...fixed, ...style }} aria-hidden />
}
