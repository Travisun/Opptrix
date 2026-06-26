import { makeStyles, Text } from '@fluentui/react-components'
import { innoTokens } from '../theme/tokens'

const useStyles = makeStyles({
  root: {
    padding: '48px 24px',
    textAlign: 'center',
    color: innoTokens.textTertiary,
    fontSize: '13px',
    backgroundColor: innoTokens.surfaceMuted,
    borderRadius: innoTokens.radiusLg,
    border: `1px dashed ${innoTokens.border}`,
  },
})

interface Props {
  message: string
}

export default function EmptyState({ message }: Props) {
  const s = useStyles()
  return <Text className={s.root}>{message}</Text>
}
