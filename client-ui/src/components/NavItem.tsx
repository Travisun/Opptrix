import { makeStyles, tokens, Text, mergeClasses } from '@fluentui/react-components'
import type { FluentIcon } from '@fluentui/react-icons'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'

const useStyles = makeStyles({
  root: {...ghostInteractive,

    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    height: '36px',
    padding: `0 ${tokens.spacingHorizontalS}`,
    width: '100%',
    textAlign: 'left' as const,
    position: 'relative' as const,
':hover': { backgroundColor: opptrixCssVars.surfaceMuted },
  },
  active: {
    backgroundColor: opptrixCssVars.surfaceMuted,
    '::before': {
      content: '""',
      position: 'absolute' as const,
      left: '0',
      top: '8px',
      bottom: '8px',
      width: '3px',
      borderRadius: '2px',
      backgroundColor: opptrixCssVars.accent,
    },
  },
  icon: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 'var(--opptrix-font-3xl)',
    color: opptrixCssVars.textSecondary,
  },
  iconActive: { color: opptrixCssVars.accent },
  label: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    fontWeight: 500,
  },
  labelActive: {
    color: opptrixCssVars.textPrimary,
    fontWeight: 600,
  },
})

interface Props {
  icon: FluentIcon
  label: string
  active?: boolean
  onClick: () => void
}

export default function NavItem({ icon: Icon, label, active, onClick }: Props) {
  const s = useStyles()
  return (
    <button
      type="button"
      className={mergeClasses(s.root, active && s.active, 'opptrix-focusable')}
      onClick={onClick}
    >
      <span className={mergeClasses(s.icon, active && s.iconActive)}>
        <Icon />
      </span>
      <Text className={mergeClasses(s.label, active && s.labelActive)}>{label}</Text>
    </button>
  )
}
