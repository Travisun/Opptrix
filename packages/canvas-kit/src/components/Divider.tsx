import type { CSSProperties } from 'react'
import { cx } from '../cx.js'

export type DividerProps = {
  className?: string
  style?: CSSProperties
}

/** Thin horizontal rule using semantic separator token. */
export function Divider({ className, style }: DividerProps) {
  return <hr className={cx('oxc-divider', className)} style={style} />
}
