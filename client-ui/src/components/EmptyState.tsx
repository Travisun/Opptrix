import { makeStyles, tokens, Text } from '@fluentui/react-components'

const useStyles = makeStyles({
  root: {
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalL}`,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
})

interface Props {
  message: string
}

export default function EmptyState({ message }: Props) {
  const s = useStyles()
  return <Text className={s.root}>{message}</Text>
}
