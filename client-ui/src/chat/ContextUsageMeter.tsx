import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
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
  compact: {
    maxWidth: '88px',
    flexShrink: 0,
  },
  stacked: {
    display: 'block',
    maxWidth: '100%',
    width: '100%',
    fontSize: 'var(--opptrix-font-xs)',
    lineHeight: 1.35,
    textAlign: 'right',
    whiteSpace: 'normal',
    overflow: 'visible',
    textOverflow: 'unset',
  },
  panel: {
    display: 'block',
    maxWidth: '100%',
    width: '100%',
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.45,
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'normal',
    overflow: 'visible',
    textOverflow: 'unset',
  },
})

interface ContextUsageMeterProps {
  usage: ChatContextUsage | null | undefined
  /** 工具栏精简：只显示用量百分比（缓存信息放 title） */
  compact?: boolean
  /** 手机：叠在模型选择下方，展示完整上下文与缓存 */
  stacked?: boolean
  /** 模型配置面板底部信息栏 */
  panel?: boolean
}

export default function ContextUsageMeter({
  usage,
  compact = false,
  stacked = false,
  panel = false,
}: ContextUsageMeterProps) {
  const s = useStyles()
  if (!usage) return null
  const percent = resolveContextUsagePercent(usage)
  const contextLabel = formatContextUsageLabel(percent, usage.compacted)
  const cacheLabel = usage.cacheHitPercent !== undefined
    ? formatCacheHitLabel(usage.cacheHitPercent)
    : null
  const fullLabel = cacheLabel ? `${contextLabel} · ${cacheLabel}` : contextLabel
  const displayLabel = panel || stacked ? fullLabel : (compact ? contextLabel : fullLabel)
  const nearLimitHint = percent >= 85 ? ' · 上下文接近上限' : ''
  const cacheHint = usage.cacheHitPercent !== undefined && usage.cacheHitPercent > 0
    ? ' · 最近一轮请求中，较早内容复用了缓存'
    : usage.cacheHitPercent === 0
      ? ' · 本轮未命中前缀缓存'
      : ''
  const title = `${fullLabel}${nearLimitHint}${cacheHint}`
  return (
    <Text
      className={mergeClasses(s.root, compact && s.compact, stacked && s.stacked, panel && s.panel)}
      title={title}
      aria-label={title}
    >
      {displayLabel}
    </Text>
  )
}
