import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { opptrixCssVars } from '../theme/tokens'
import { iconBtnMixin } from '../theme/mixins'

type IconBtnSize = 'sm' | 'md' | 'lg' | 'xl'

interface ChromeToolButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  label: string
  /** Button size — overrides default dimension */
  size?: IconBtnSize
  /** Inner padding — smaller values leave room for a larger glyph in the same hit target */
  iconPadding?: number
  active?: boolean
}

const useStyles = makeStyles({
  btn: iconBtnMixin('md'),
  btnActive: {
    backgroundColor: opptrixCssVars.accentSoft,
    color: opptrixCssVars.accent,
    ':hover': {
      backgroundColor: opptrixCssVars.accentSoft,
      color: opptrixCssVars.accent,
    },
  },
  btnSm: iconBtnMixin('sm'),
  btnMd: iconBtnMixin('md'),
  btnLg: iconBtnMixin('lg'),
  btnXl: iconBtnMixin('xl'),
})

export default function ChromeToolButton({
  children,
  label,
  className,
  size = 'md',
  iconPadding,
  active = false,
  style,
  ...rest
}: ChromeToolButtonProps) {
  const s = useStyles()
  const sizeClass = size === 'sm' ? s.btnSm
    : size === 'lg' ? s.btnLg
      : size === 'xl' ? s.btnXl
        : s.btnMd

  return (
    <button
      type="button"
      className={mergeClasses(sizeClass, active && s.btnActive, 'opptrix-focusable', className)}
      aria-pressed={active || undefined}
      aria-label={label}
      title={label}
      style={iconPadding !== undefined ? { padding: `${iconPadding}px`, ...style } : style}
      {...rest}
    >
      {children}
    </button>
  )
}
