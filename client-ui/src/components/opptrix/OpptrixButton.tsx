import { Button, mergeClasses, makeStyles } from '@fluentui/react-components'
import type { ComponentProps } from 'react'
import {
  ghostInteractive,
  primaryInteractive,
  secondaryInteractive,
  dangerInteractive,
  focusVisibleRing,
  motion,
  buttonSizes,
} from '../../theme/mixins'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon'
/** @deprecated Use 'primary' or 'ghost' instead */
type DeprecatedVariant = 'pill'
type Size = 'small' | 'medium' | 'large'

type Props = ComponentProps<typeof Button> & {
  variant?: Variant | DeprecatedVariant
  size?: Size
  block?: boolean
}

const useStyles = makeStyles({
  primary: {
    ...primaryInteractive,
    borderRadius: opptrixTokens.radiusMd,
    fontWeight: 600,
    transitionProperty: 'background-color, color, opacity, transform',
    transitionDuration: `${motion.fast}, ${motion.press}`,
    ':active': {
      transform: 'scale(0.97)',
      opacity: 0.88,
    },
    '@media (prefers-reduced-motion: reduce)': {
      ':active': { transform: 'none' },
    },
  },
  secondary: {
    ...secondaryInteractive,
    fontWeight: 500,
    transitionProperty: 'background-color, color, opacity, transform',
    transitionDuration: `${motion.fast}, ${motion.press}`,
    ':active': {
      transform: 'scale(0.97)',
      opacity: opptrixTokens.activeOpacity,
    },
    '@media (prefers-reduced-motion: reduce)': {
      ':active': { transform: 'none' },
    },
  },
  ghost: {
    ...ghostInteractive,
    color: opptrixCssVars.textSecondary,
    fontWeight: 500,
    transitionProperty: 'background-color, color, opacity, transform',
    transitionDuration: `${motion.fast}, ${motion.press}`,
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      color: opptrixCssVars.textPrimary,
    },
    ':active': {
      transform: 'scale(0.97)',
      opacity: opptrixTokens.activeOpacity,
    },
    '@media (prefers-reduced-motion: reduce)': {
      ':active': { transform: 'none' },
    },
  },
  danger: {
    ...dangerInteractive,
    fontWeight: 500,
    transitionProperty: 'background-color, color, opacity, transform',
    transitionDuration: `${motion.fast}, ${motion.press}`,
    ':active': {
      transform: 'scale(0.97)',
      opacity: 0.88,
    },
    '@media (prefers-reduced-motion: reduce)': {
      ':active': { transform: 'none' },
    },
  },
  icon: {
    ...ghostInteractive,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    ':active': {
      transform: 'scale(0.97)',
      opacity: opptrixTokens.activeOpacity,
    },
    '@media (prefers-reduced-motion: reduce)': {
      ':active': { transform: 'none' },
    },
  },
  /** @deprecated Backward compat only — rounded pill variant */
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
  // Size variants
  sizeSmall: {
    fontSize: buttonSizes.small.fontSize,
    paddingLeft: buttonSizes.small.paddingX,
    paddingRight: buttonSizes.small.paddingX,
    minHeight: buttonSizes.small.minHeight,
    '--opptrix-btn-icon-size': '12px',
  },
  sizeMedium: {
    fontSize: buttonSizes.medium.fontSize,
    paddingLeft: buttonSizes.medium.paddingX,
    paddingRight: buttonSizes.medium.paddingX,
    minHeight: buttonSizes.medium.minHeight,
    '--opptrix-btn-icon-size': '16px',
  },
  sizeLarge: {
    fontSize: buttonSizes.large.fontSize,
    paddingLeft: buttonSizes.large.paddingX,
    paddingRight: buttonSizes.large.paddingX,
    minHeight: buttonSizes.large.minHeight,
    '--opptrix-btn-icon-size': '20px',
  },
  block: {
    width: '100%',
  },
})

function getVariantClass(variant: Variant | DeprecatedVariant, s: ReturnType<typeof useStyles>) {
  switch (variant) {
    case 'primary': return s.primary
    case 'secondary': return s.secondary
    case 'ghost': return s.ghost
    case 'danger': return s.danger
    case 'icon': return s.icon
    case 'pill': return s.pill
    default: return s.ghost
  }
}

function getSizeClass(size: Size, s: ReturnType<typeof useStyles>) {
  switch (size) {
    case 'small': return s.sizeSmall
    case 'medium': return s.sizeMedium
    case 'large': return s.sizeLarge
    default: return s.sizeMedium
  }
}

export default function OpptrixButton({
  variant = 'primary',
  size = 'medium',
  block = false,
  className,
  ...props
}: Props) {
  const s = useStyles()
  const variantClass = getVariantClass(variant, s)
  const sizeClass = variant === 'icon' ? undefined : getSizeClass(size, s)

  const appearance = variant === 'primary' ? 'primary'
    : variant === 'secondary' ? 'secondary'
      : variant === 'danger' ? 'outline'
        : 'subtle'

  return (
    <Button
      appearance={appearance}
      className={mergeClasses(
        'opptrix-btn',
        'opptrix-focusable',
        variantClass,
        sizeClass,
        block && s.block,
        className,
      )}
      {...props}
    />
  )
}
