import { Button, type ButtonProps, mergeClasses, makeStyles } from '@fluentui/react-components'
import {
  ghostInteractive, primaryInteractive, secondaryInteractive, focusVisibleRing, motion,
} from '../../theme/mixins'
import { innoTokens } from '../../theme/tokens'

const useStyles = makeStyles({
  primary: {
    ...primaryInteractive,
    borderRadius: innoTokens.radiusMd,
    fontWeight: 600,
    fontSize: '14px',
  },
  secondary: {
    ...secondaryInteractive,
    fontWeight: 500,
    fontSize: '14px',
  },
  ghost: {
    ...ghostInteractive,
    color: innoTokens.textSecondary,
    fontWeight: 500,
    fontSize: '14px',
    ':hover': {
      backgroundColor: innoTokens.surfaceHover,
      color: innoTokens.textPrimary,
    },
  },
  pill: {
    borderRadius: innoTokens.radiusFull,
    fontWeight: 500,
    fontSize: '13px',
    transitionProperty: 'background-color, color, opacity, border-color',
    transitionDuration: motion.fast,
    border: `1px solid ${innoTokens.border}`,
    backgroundColor: innoTokens.canvas,
    color: innoTokens.textSecondary,
    ':hover': {
      backgroundColor: innoTokens.canvasAlt,
      color: innoTokens.textPrimary,
      borderColor: innoTokens.separatorStrong,
    },
    ':active': {
      opacity: innoTokens.activeOpacity,
    },
    ...focusVisibleRing,
  },
  iconBtn: {
    ...ghostInteractive,
    minWidth: '32px',
    height: '32px',
    borderRadius: innoTokens.radiusSm,
    color: innoTokens.textTertiary,
    ':hover': {
      color: innoTokens.textPrimary,
      backgroundColor: innoTokens.accentSoft,
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
      className={mergeClasses('inno-btn', 'inno-focusable', variantClass, className)}
      {...props}
    />
  )
}
