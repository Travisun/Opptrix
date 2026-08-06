import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx.js'

export type CardHeaderProps = {
  className?: string
  style?: CSSProperties
  /** Plain text title — avoid nesting H1 here. */
  title?: ReactNode
  trailing?: ReactNode
  sticky?: boolean
  collapsible?: boolean
  collapsed?: boolean
  onToggle?: () => void
  /** Legacy free-form header content (used when `title` is omitted). */
  children?: ReactNode
}

/** Compact card chrome: title + trailing. Prefer plain text titles. */
export function CardHeader({
  className,
  style,
  title,
  trailing,
  sticky,
  collapsible,
  collapsed,
  onToggle,
  children,
}: CardHeaderProps) {
  const showStructured = title != null || trailing != null || collapsible

  return (
    <div
      className={cx('oxc-card-header', sticky && 'oxc-card-header--sticky', className)}
      style={style}
    >
      {showStructured ? (
        <>
          {collapsible ? (
            <button
              type="button"
              className="oxc-card-header__toggle"
              aria-expanded={!collapsed}
              onClick={onToggle}
            >
              {collapsed ? '+' : '−'}
            </button>
          ) : null}
          {title != null ? <p className="oxc-card-header__title">{title}</p> : <span className="oxc-card-header__title" />}
          {trailing != null ? <div className="oxc-card-header__trailing">{trailing}</div> : null}
        </>
      ) : (
        children
      )}
    </div>
  )
}
