import { makeStyles, Text } from '@fluentui/react-components'
import type { ReactNode } from 'react'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'

const useStyles = makeStyles({
  card: {
    backgroundColor: opptrixCssVars.surface,
    borderRadius: opptrixTokens.radiusLg,
    border: `1px solid ${opptrixCssVars.separator}`,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
  },
})

interface Props {
  title?: string
  children: ReactNode
}

export default function SectionCard({ title, children }: Props) {
  const s = useStyles()
  return (
    <div className={s.card}>
      {title && <Text className={s.title}>{title}</Text>}
      {children}
    </div>
  )
}
