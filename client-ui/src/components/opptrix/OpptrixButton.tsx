import { Button, type ButtonProps, mergeClasses, makeStyles } from '@fluentui/react-components'
import {
  ghostInteractive, primaryInteractive, secondaryInteractive, focusVisibleRing, motion,
} from '../../theme/mixins'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'

const useStyles = makeStyles({
  primary: {
    ...primaryInteractive,
    borderRadius: opptrixTokens.radiusMd,
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
    color: opptrixCssVars.textSecondary,
    fontWeight: 500,
    fontSize: '14px',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      color: opptrixCssVars.textPrimary,
    },
  },
  pill: {
    borderRadius: opptrixTokens.radiusFull,
    fontWeight: 500,
    fontSize: '13px',
    transitionProperty: 'background-color, color, opacity, border-color',
    transitionDuration: motion.fast,
    border: `1px solid ${opptrixCssVars.border}`,
    backgroundColor: opptrixCssVars.canvas,
    color: opptrixCssVars.textSecondary,
    ':hover': {
      backgroundColor: opptrixCssVars.canvasAlt,
      color: opptrixCssVars.textPrimary,
      borderColor: opptrixCssVars.separatorStrong,
    },
    ':active': {
      opacity: opptrixTokens.activeOpacity,
    },
    ...focusVisibleRing,
  },
  iconBtn: {
    ...ghostInteractive,
    minWidth: '32px',
    height: '32px',
    borderRadius: opptrixTokens.radiusSm,
    color: opptrixCssVars.textTertiary,
    ':hover': {
      color: opptrixCssVars.textPrimary,
      backgroundColor: opptrixCssVars.accentSoft,
    },
  },
})

type Variant = 'primary' | 'secondary' | 'ghost' | 'pill' | 'icon'

interface Props extends ButtonProps {
  variant?: Variant
}

export default function OpptrixButton({ variant = 'primary', className, ...props }: Props) {
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
      className={mergeClasses('opptrix-btn', 'opptrix-focusable', variantClass, className)}
      {...props}
    />
  )
}
