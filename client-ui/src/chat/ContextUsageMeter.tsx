import { Text, makeStyles } from '@fluentui/react-components'
import { opptrixCssVars } from '../theme/tokens'
import { formatContextUsageLabel, formatCacheHitLabel, resolveContextUsagePercent } from './formatTokenCount'
import type { ChatContextUsage } from '../types/chat'

const useStyles = makeStyles({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    maxWidth: '220px',
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
  const contextLabel = formatContextUsageLabel(percent, usage.compacted)
  const cacheLabel = usage.cacheHitPercent !== undefined
    ? formatCacheHitLabel(usage.cacheHitPercent)
    : null
  const label = cacheLabel ? `${contextLabel} · ${cacheLabel}` : contextLabel
  const nearLimitHint = percent >= 85 ? ' · 上下文接近上限' : ''
  const cacheHint = usage.cacheHitPercent !== undefined && usage.cacheHitPercent > 0
    ? ' · 最近一轮请求中，较早内容复用了缓存'
    : usage.cacheHitPercent === 0
      ? ' · 本轮未命中前缀缓存'
      : ''
  const title = `${label}${nearLimitHint}${cacheHint}`
  return (
    <Text className={s.root} title={title} aria-label={title}>
      {label}
    </Text>
  )
}
