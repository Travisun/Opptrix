import type { AnchorHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { cx } from '../cx.js'

export type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'style'> & {
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

/** External / in-panel text link (opens in a new browsing context by default). */
export function Link({
  className,
  style,
  children,
  href,
  target = '_blank',
  rel,
  ...rest
}: LinkProps) {
  const resolvedRel =
    rel ?? (target === '_blank' ? 'noopener noreferrer' : undefined)

  return (
    <a
      className={cx('oxc-link', className)}
      style={style}
      href={href}
      target={target}
      rel={resolvedRel}
      {...rest}
    >
      {children}
    </a>
  )
}
