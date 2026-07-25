import { Text, makeStyles } from '@fluentui/react-components'
import { opptrixCssVars } from '../theme/tokens'
import { formatTurnUsageLabel } from './formatTokenCount'

const useStyles = makeStyles({
  root: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
    marginTop: '6px',
  },
})

interface MessageTokenLabelProps {
  totalTokens: number
  estimated?: boolean
}

export default function MessageTokenLabel({ totalTokens, estimated }: MessageTokenLabelProps) {
  const s = useStyles()
  if (totalTokens <= 0) return null
  return (
    <Text className={s.root} block>
      {formatTurnUsageLabel(totalTokens, estimated)}
    </Text>
  )
}
