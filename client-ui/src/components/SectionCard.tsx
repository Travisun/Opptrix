import { makeStyles, tokens, Text } from '@fluentui/react-components'
import type { ReactNode } from 'react'

const useStyles = makeStyles({
  card: {
    backgroundColor: tokens.colorNeutralBackground2,
    padding: tokens.spacingVerticalM,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  title: {
    color: tokens.colorNeutralForeground2,
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
      {title && <Text size={300} weight="semibold" className={s.title}>{title}</Text>}
      {children}
    </div>
  )
}
