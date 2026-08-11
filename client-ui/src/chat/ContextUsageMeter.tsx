import { Text, makeStyles } from '@fluentui/react-components'
import { opptrixCssVars } from '../theme/tokens'
import { formatContextUsageLabel, resolveContextUsagePercent } from './formatTokenCount'
import type { ChatContextUsage } from '../types/chat'

const useStyles = makeStyles({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    maxWidth: '180px',
    minWidth: 0,
    flexShrink: 1,
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    lineHeight: 1.4,
  },
})

interface ContextUsageMeterProps {
  usage: ChatContextUsage | null | undefined
}

export default function ContextUsageMeter({ usage }: ContextUsageMeterProps) {
  const s = useStyles()
  if (!usage) return null
  const percent = resolveContextUsagePercent(usage)
  const label = formatContextUsageLabel(percent, usage.compacted)
  const title = `${label}${percent >= 85 ? ' · 上下文接近上限' : ''}`
  return (
    <Text className={s.root} title={title} aria-label={title}>
      {label}
    </Text>
  )
}
