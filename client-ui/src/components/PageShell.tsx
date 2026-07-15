import { makeStyles, tokens, Text } from '@fluentui/react-components'
import type { ReactNode } from 'react'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    minHeight: '100%',
    maxWidth: '1200px',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalL,
    flexWrap: 'wrap',
  },
  kicker: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: opptrixCssVars.accent,
    marginBottom: '4px',
  },
  title: {
    fontSize: 'var(--opptrix-font-3xl)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.3,
  },
  subtitle: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    marginTop: '4px',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
})

interface Props {
  title: string
  kicker?: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}

export default function PageShell({ title, kicker = 'INNOASTOCK', subtitle, actions, children }: Props) {
  const s = useStyles()
  return (
    <div className={s.root}>
      <div className={s.header}>
        <div>
          <div className={s.kicker}>{kicker}</div>
          <div className={s.title}>{title}</div>
          {subtitle && <Text className={s.subtitle}>{subtitle}</Text>}
        </div>
        {actions && <div className={s.actions}>{actions}</div>}
      </div>
      <div className={s.body}>{children}</div>
    </div>
  )
}
