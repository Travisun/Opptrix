import { makeStyles, Text } from '@fluentui/react-components'
import type { ReactNode } from 'react'
import { opptrixTokens } from '../../theme/tokens'
import { surfaceGrouped } from '../../theme/mixins'

const useStyles = makeStyles({
  surface: {
    ...surfaceGrouped,
  },
  header: {
    padding: '12px 16px 8px',
  },
  title: {
    fontSize: '13px',
    fontWeight: 600,
    color: opptrixTokens.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.02em',
  },
  subtitle: {
    fontSize: '12px',
    color: opptrixTokens.textTertiary,
    marginTop: '2px',
    textTransform: 'none',
    letterSpacing: 0,
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
  },
  bodyPadded: {
    padding: '4px 16px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
})

interface Props {
  title?: string
  subtitle?: string
  children: ReactNode
  className?: string
  /** iOS section header above the white group */
  sectionHeader?: boolean
}

export default function OpptrixSurface({ title, subtitle, children, className, sectionHeader = true }: Props) {
  const s = useStyles()
  return (
    <div className={className}>
      {sectionHeader && title && (
        <div className={s.header}>
          <Text className={s.title}>{title}</Text>
          {subtitle && <Text className={s.subtitle}>{subtitle}</Text>}
        </div>
      )}
      <section className={s.surface}>
        <div className={s.bodyPadded}>{children}</div>
      </section>
    </div>
  )
}

/** Row divider inside grouped surface */
export function OpptrixDivider() {
  return <div style={{ height: 1, background: opptrixTokens.separator, margin: '0 -16px' }} />
}
