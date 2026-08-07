import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { cx } from '../cx.js'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'default'

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'> & {
  className?: string
  style?: CSSProperties
  /** `default` maps to secondary (compat). */
  variant?: ButtonVariant
  children?: ReactNode
}

/** Compact action control (~24px) — inline by default, not full-width. */
export function Button({
  className,
  style,
  variant = 'secondary',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const resolved =
    variant === 'default' || variant === 'secondary'
      ? 'secondary'
      : variant

  return (
    <button
      type={type}
      className={cx(
        'oxc-btn',
        resolved === 'primary' && 'oxc-btn--primary',
        resolved === 'secondary' && 'oxc-btn--secondary',
        resolved === 'ghost' && 'oxc-btn--ghost',
        className,
      )}
      style={style}
      {...rest}
    >
      {children}
    </button>
  )
}
