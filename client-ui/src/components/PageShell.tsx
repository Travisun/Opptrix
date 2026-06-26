import { makeStyles, tokens, Text } from '@fluentui/react-components'
import type { ReactNode } from 'react'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    minHeight: '100%',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  titleBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
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
    gap: tokens.spacingVerticalM,
  },
})

interface Props {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}

export default function PageShell({ title, subtitle, actions, children }: Props) {
  const s = useStyles()
  return (
    <div className={s.root}>
      <div className={s.header}>
        <div className={s.titleBlock}>
          <Text size={500} weight="semibold">{title}</Text>
          {subtitle && <Text size={200} className={s.subtitle}>{subtitle}</Text>}
        </div>
        {actions && <div className={s.actions}>{actions}</div>}
      </div>
      <div className={s.body}>{children}</div>
    </div>
  )
}
