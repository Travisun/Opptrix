import { Button, type ButtonProps, mergeClasses, makeStyles } from '@fluentui/react-components'
import { ghostInteractive, primaryInteractive, focusRing, motion } from '../../theme/mixins'
import { innoTokens } from '../../theme/tokens'

const useStyles = makeStyles({
  primary: {
    ...primaryInteractive,
    borderRadius: innoTokens.radiusMd,
    fontWeight: 600,
  },
  secondary: {
    ...ghostInteractive,
    backgroundColor: innoTokens.surfaceMuted,
    color: innoTokens.textPrimary,
    fontWeight: 500,
    ':hover': {
      backgroundColor: innoTokens.surfaceHover,
    },
  },
  ghost: {
    ...ghostInteractive,
    color: innoTokens.accent,
    fontWeight: 500,
    ':hover': {
      backgroundColor: innoTokens.surfaceMuted,
    },
  },
  pill: {
    borderRadius: innoTokens.radiusFull,
    fontWeight: 500,
    fontSize: '14px',
    transitionProperty: 'background-color, color, opacity',
    transitionDuration: motion.fast,
    border: 'none',
    backgroundColor: innoTokens.surface,
    color: innoTokens.textPrimary,
    ':hover': {
      backgroundColor: innoTokens.surfaceMuted,
    },
    ':active': {
      opacity: 0.72,
    },
    ':focus-visible': focusRing,
  },
  iconBtn: {
    ...ghostInteractive,
    minWidth: '44px',
    height: '44px',
    borderRadius: innoTokens.radiusSm,
    color: innoTokens.textTertiary,
    ':hover': {
      color: innoTokens.error,
      backgroundColor: innoTokens.errorSoft,
    },
  },
})

type Variant = 'primary' | 'secondary' | 'ghost' | 'pill' | 'icon'

interface Props extends ButtonProps {
  variant?: Variant
}

export default function InnoButton({ variant = 'primary', className, ...props }: Props) {
  const s = useStyles()
  const variantClass = variant === 'primary' ? s.primary
    : variant === 'secondary' ? s.secondary
      : variant === 'pill' ? s.pill
        : variant === 'icon' ? s.iconBtn
          : s.ghost

  const appearance = variant === 'primary' ? 'primary'
    : variant === 'secondary' ? 'secondary'
      : 'subtle'

  return (
    <Button
      appearance={appearance}
      className={mergeClasses(variantClass, className)}
      {...props}
    />
  )
}
