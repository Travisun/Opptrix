import { Button, mergeClasses, makeStyles } from '@fluentui/react-components'
import type { ComponentProps } from 'react'
import {
  ghostInteractive, primaryInteractive, secondaryInteractive, focusVisibleRing, motion,
} from '../../theme/mixins'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'

const useStyles = makeStyles({
  primary: {
    ...primaryInteractive,
    borderRadius: opptrixTokens.radiusMd,
    fontWeight: 600,
    fontSize: 'var(--opptrix-font-base)',
    paddingLeft: '14px',
    paddingRight: '14px',
    minHeight: '28px',
    transitionProperty: 'background-color, color, opacity, transform, box-shadow',
    transitionDuration: `${motion.fast}, ${motion.press}`,
    ':active': {
      transform: 'scale(0.97)',
    },
  },
  secondary: {
    ...secondaryInteractive,
    fontWeight: 500,
    fontSize: 'var(--opptrix-font-base)',
    paddingLeft: '14px',
    paddingRight: '14px',
    minHeight: '28px',
    transitionProperty: 'background-color, color, opacity, transform, box-shadow',
    transitionDuration: `${motion.fast}, ${motion.press}`,
    ':active': {
      transform: 'scale(0.97)',
    },
  },
  ghost: {
    ...ghostInteractive,
    color: opptrixCssVars.textSecondary,
    fontWeight: 500,
    fontSize: 'var(--opptrix-font-base)',
    paddingLeft: '10px',
    paddingRight: '10px',
    minHeight: '28px',
    transitionProperty: 'background-color, color, opacity, transform',
    transitionDuration: `${motion.fast}, ${motion.press}`,
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      color: opptrixCssVars.textPrimary,
    },
    ':active': {
      transform: 'scale(0.97)',
    },
  },
  pill: {
    borderRadius: opptrixTokens.radiusFull,
    fontWeight: 500,
    fontSize: 'var(--opptrix-font-base)',
    transitionProperty: 'background-color, color, opacity, border-color',
    transitionDuration: motion.fast,
    border: `1px solid ${opptrixCssVars.border}`,
    backgroundColor: opptrixCssVars.canvas,
    color: opptrixCssVars.textSecondary,
    ':hover': {
      backgroundColor: opptrixCssVars.canvasAlt,
      color: opptrixCssVars.textPrimary,
      border: `1px solid ${opptrixCssVars.separatorStrong}`,
    },
    ':active': {
      opacity: opptrixTokens.activeOpacity,
    },
    ...focusVisibleRing,
  },
  iconBtn: {
    ...ghostInteractive,
    minWidth: '28px',
    width: '28px',
    height: '28px',
    borderRadius: opptrixTokens.radiusSm,
    fontSize: 'var(--opptrix-font-lg)',
    color: opptrixCssVars.textTertiary,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    ':hover': {
      color: opptrixCssVars.textPrimary,
      backgroundColor: opptrixCssVars.accentSoft,
    },
    '& svg': {
      width: '14px',
      height: '14px',
    },
  },
})

type Variant = 'primary' | 'secondary' | 'ghost' | 'pill' | 'icon'

type Props = ComponentProps<typeof Button> & {
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
