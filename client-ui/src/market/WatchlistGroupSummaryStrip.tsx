import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { formatMoney as formatMoneyDefault, formatPct, pctTone } from './format'
import type { WatchlistGroupSummaryMetrics } from './watchlistGroupCalc'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { MARKET_DOWN, MARKET_UP } from './chartTheme'

const CONTENT_PAD = '15px'

const useStyles = makeStyles({
  root: {
    flexShrink: 0,
    padding: `8px ${CONTENT_PAD} 6px`,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  metric: {
    padding: '5px 8px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.surfaceMuted,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    minWidth: '72px',
    flex: '1 1 0',
    maxWidth: 'calc(50% - 3px)',
  },
  label: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    fontWeight: 600,
    lineHeight: 1.3,
  },
  value: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
  },
})

function pnlColor(pct: number | null | undefined): string {
  const tone = pctTone(pct)
  if (tone === 'up') return MARKET_UP
  if (tone === 'down') return MARKET_DOWN
  return opptrixCssVars.textSecondary
}

type Props = {
  metrics: WatchlistGroupSummaryMetrics
  groupTitle?: string | null
  mode: 'watchlist' | 'portfolio'
  portfolioSummary?: {
    totalMarketValue: number
    totalPnlPct: number | null
    totalUnrealizedPnl: number
    holdingsCount: number
  } | null
  /** 金额格式（市值 / 浮动盈亏）；默认千分位 */
  formatMoney?: (v: number) => string
  className?: string
}

export default function WatchlistGroupSummaryStrip({
  metrics,
  groupTitle,
  mode,
  portfolioSummary,
  formatMoney = formatMoneyDefault,
  className,
}: Props) {
  const s = useStyles()
  const prefix = groupTitle ? `${groupTitle} · ` : ''

  if (mode === 'portfolio' && portfolioSummary) {
    return (
      <div className={mergeClasses(s.root, className)}>
        <div className={s.metric}>
          <Text className={s.label}>{groupTitle ? `${groupTitle} · 市值` : '总市值'}</Text>
          <Text className={s.value}>{formatMoney(portfolioSummary.totalMarketValue)}</Text>
        </div>
        <div className={s.metric}>
          <Text className={s.label}>{groupTitle ? '分组收益' : '总收益'}</Text>
          <Text className={s.value} style={{ color: pnlColor(portfolioSummary.totalPnlPct) }}>
            {formatPct(portfolioSummary.totalPnlPct)}
          </Text>
        </div>
        <div className={s.metric}>
          <Text className={s.label}>浮动盈亏</Text>
          <Text className={s.value} style={{ color: pnlColor(portfolioSummary.totalUnrealizedPnl) }}>
            {formatMoney(portfolioSummary.totalUnrealizedPnl)}
          </Text>
        </div>
        <div className={s.metric}>
          <Text className={s.label}>持仓</Text>
          <Text className={s.value}>{portfolioSummary.holdingsCount} 只</Text>
        </div>
      </div>
    )
  }

  if (metrics.itemCount === 0) return null

  return (
    <div className={mergeClasses(s.root, className)}>
      <div className={s.metric}>
        <Text className={s.label}>{prefix}标的</Text>
        <Text className={s.value}>{metrics.itemCount} 只</Text>
      </div>
      <div className={s.metric}>
        <Text className={s.label}>持有</Text>
        <Text className={s.value}>{metrics.holdingCount} 只</Text>
      </div>
      <div className={s.metric}>
        <Text className={s.label}>持仓收益</Text>
        <Text className={s.value} style={{ color: pnlColor(metrics.holdingReturnPct) }}>
          {formatPct(metrics.holdingReturnPct)}
        </Text>
      </div>
    </div>
  )
}
