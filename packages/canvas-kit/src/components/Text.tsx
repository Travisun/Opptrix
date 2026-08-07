import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx.js'

export type TextTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'default'
  | 'muted'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
export type TextSize = 'body' | 'small'
export type TextAlign = 'start' | 'center' | 'end'

export type TextProps = {
  className?: string
  style?: CSSProperties
  children?: ReactNode
  as?: 'p' | 'span' | 'div'
  tone?: TextTone
  size?: TextSize
  /** Horizontal alignment. Default start. */
  align?: TextAlign
  weight?: CSSProperties['fontWeight']
  italic?: boolean
  truncate?: boolean
}

const TONE_CLASS: Record<TextTone, string | undefined> = {
  primary: 'oxc-text--primary',
  default: undefined,
  secondary: 'oxc-text--secondary',
  tertiary: 'oxc-text--tertiary',
  muted: 'oxc-text--muted',
  success: 'oxc-text--success',
  warning: 'oxc-text--warning',
  danger: 'oxc-text--danger',
  info: 'oxc-text--info',
}

const ALIGN_CLASS: Record<TextAlign, string | undefined> = {
  start: undefined,
  center: 'oxc-text--align-center',
  end: 'oxc-text--align-end',
}

/** Body copy. Use tone / size for hierarchy instead of raw color hex. */
export function Text({
  className,
  style,
  children,
  as: Tag = 'p',
  tone = 'primary',
  size = 'body',
  align = 'start',
  weight,
  italic,
  truncate,
}: TextProps) {
  return (
    <Tag
      className={cx(
        'oxc-text',
        TONE_CLASS[tone],
        size === 'small' && 'oxc-text--small',
        ALIGN_CLASS[align],
        italic && 'oxc-text--italic',
        truncate && 'oxc-text--truncate',
        className,
      )}
      style={{ fontWeight: weight, ...style }}
    >
      {children}
    </Tag>
  )
}
