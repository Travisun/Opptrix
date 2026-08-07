import { useState, type CSSProperties, type ReactNode } from 'react'
import { cx } from '../cx.js'
import { CardHeader } from './CardHeader.js'
import { CardBody } from './CardBody.js'

export type CardVariant = 'default' | 'borderless'
export type CardSize = 'base' | 'lg'

export type CardProps = {
  className?: string
  style?: CSSProperties
  children?: ReactNode
  /** Bordered surface (default) or soft borderless block. */
  variant?: CardVariant
  /** Header height ~28px (base) / ~32px (lg). */
  size?: CardSize
  /** Plain-text header title; prefer over nesting H1. */
  title?: ReactNode
  trailing?: ReactNode
  stickyHeader?: boolean
  collapsible?: boolean
  defaultCollapsed?: boolean
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

/**
 * Optional bordered surface for a highlighted block.
 * Prefer open Stack chapters with sparse cards — do not wrap every section.
 */
export function Card({
  className,
  style,
  children,
  variant = 'default',
  size = 'base',
  title,
  trailing,
  stickyHeader,
  collapsible,
  defaultCollapsed = false,
  collapsed: collapsedProp,
  onCollapsedChange,
}: CardProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultCollapsed)
  const isControlled = collapsedProp != null
  const collapsed = isControlled ? Boolean(collapsedProp) : uncontrolled

  const setCollapsed = (next: boolean) => {
    if (!isControlled) setUncontrolled(next)
    onCollapsedChange?.(next)
  }

  const hasBuiltInHeader = title != null || trailing != null || collapsible

  return (
    <div
      className={cx(
        'oxc-card',
        variant === 'borderless' && 'oxc-card--borderless',
        size === 'lg' && 'oxc-card--lg',
        collapsed && 'oxc-card--collapsed',
        className,
      )}
      style={style}
    >
      {hasBuiltInHeader ? (
        <CardHeader
          title={title}
          trailing={trailing}
          sticky={stickyHeader}
          collapsible={collapsible}
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
        />
      ) : null}
      {hasBuiltInHeader ? (
        <CardBody>{children}</CardBody>
      ) : (
        children
      )}
    </div>
  )
}
