import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { innoTokens } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'
import { DESKTOP_TOOL_ICON_PADDING, DESKTOP_TOOL_SIZE } from './constants'

const useStyles = makeStyles({
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: `${DESKTOP_TOOL_SIZE}px`,
    height: `${DESKTOP_TOOL_SIZE}px`,
    minWidth: `${DESKTOP_TOOL_SIZE}px`,
    boxSizing: 'border-box',
    ...ghostInteractive,
    borderRadius: innoTokens.radiusSm,
    color: innoTokens.textSecondary,
    flexShrink: 0,
    WebkitAppRegion: 'no-drag',
    ':hover': {
      backgroundColor: innoTokens.accentSoft,
      color: innoTokens.textPrimary,
    },
    ':disabled': {
      opacity: 0.28,
      cursor: 'default',
      ':hover': {
        backgroundColor: 'transparent',
        color: innoTokens.textSecondary,
      },
    },
  },
})

interface ChromeToolButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  label: string
  /** Inner padding — smaller values leave room for a larger glyph in the same hit target */
  iconPadding?: number
}

export default function ChromeToolButton({
  children,
  label,
  className,
  iconPadding = DESKTOP_TOOL_ICON_PADDING,
  style,
  ...rest
}: ChromeToolButtonProps) {
  const s = useStyles()
  return (
    <button
      type="button"
      className={mergeClasses(s.btn, 'inno-focusable', className)}
      aria-label={label}
      title={label}
      style={{ padding: `${iconPadding}px`, ...style }}
      {...rest}
    >
      {children}
    </button>
  )
}
