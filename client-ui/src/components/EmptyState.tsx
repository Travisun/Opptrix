import { makeStyles, Text } from '@fluentui/react-components'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'

const useStyles = makeStyles({
  root: {
    padding: '48px 24px',
    textAlign: 'center',
    color: opptrixCssVars.textTertiary,
    fontSize: '13px',
    backgroundColor: opptrixCssVars.surfaceMuted,
    borderRadius: opptrixTokens.radiusLg,
    border: `1px dashed ${opptrixCssVars.border}`,
  },
})

interface Props {
  message: string
}

export default function EmptyState({ message }: Props) {
  const s = useStyles()
  return <Text className={s.root}>{message}</Text>
}
