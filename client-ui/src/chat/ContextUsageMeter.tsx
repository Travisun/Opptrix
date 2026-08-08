import { Text, makeStyles } from '@fluentui/react-components'
import { opptrixCssVars } from '../theme/tokens'
import { formatContextUsageLabel } from './formatTokenCount'
import type { ChatContextUsage } from '../types/chat'

const useStyles = makeStyles({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    maxWidth: '140px',
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
  const ratio = usage.limitTokens > 0 ? usage.usedTokens / usage.limitTokens : 0
  const title = `${formatContextUsageLabel(usage.usedTokens, usage.limitTokens, usage.estimated)}${ratio >= 0.85 ? ' · 上下文接近上限' : ''}`
  return (
    <Text className={s.root} title={title} aria-label={title}>
      {formatContextUsageLabel(usage.usedTokens, usage.limitTokens, usage.estimated)}
    </Text>
  )
}
