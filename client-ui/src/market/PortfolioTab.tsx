import { useCallback, useEffect, useState } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { research } from '../api/client'
import type { PortfolioSummaryData } from '../types/schemas'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import { formatPct, formatPrice, normalizeCode, pctTone } from './format'
import { opptrixTokens } from '../theme/tokens'
import { ghostInteractive, sidebarItemSelected } from '../theme/mixins'
import { MARKET_DOWN, MARKET_UP } from './chartTheme'

const CONTENT_PAD = '15px'
const ITEM_BG_INSET = '10px'
const ITEM_INNER_PAD = '10px'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
  },
  summary: {
    flexShrink: 0,
    padding: `8px ${CONTENT_PAD} 6px`,
    borderBottom: `1px solid ${opptrixTokens.separator}`,
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  metric: {
    padding: '5px 8px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixTokens.surfaceSubtle,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    minWidth: '72px',
    flex: '1 1 0',
    maxWidth: 'calc(50% - 3px)',
  },
  metricLabel: {
    fontSize: '10px',
    color: opptrixTokens.textTertiary,
    fontWeight: 600,
    lineHeight: 1.3,
  },
  metricValue: {
    fontSize: '13px',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixTokens.textPrimary,
    lineHeight: 1.35,
  },
  list: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: `10px ${ITEM_BG_INSET} 0`,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: `6px ${ITEM_INNER_PAD}`,
    minHeight: '34px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: 'transparent',
    width: '100%',
    boxSizing: 'border-box',
    color: opptrixTokens.textPrimary,
    cursor: 'pointer',
    ...ghostInteractive,
    ':hover': {
      backgroundColor: opptrixTokens.accentSoft,
    },
    ':focus-within': {
      backgroundColor: opptrixTokens.accentSoft,
    },
  },
  rowActive: {
    ...sidebarItemSelected,
    ':hover': {
      backgroundColor: opptrixTokens.accentSoft,
    },
    ':focus-within': {
      backgroundColor: opptrixTokens.accentSoft,
    },
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  rowTitle: {
    fontSize: '13px',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'left',
  },
  rowNote: {
    fontSize: '10px',
    color: opptrixTokens.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  },
  rowTrailing: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '1px',
    minWidth: '72px',
  },
  quotePrimary: {
    fontSize: '12px',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
  },
  quoteSecondary: {
    fontSize: '10px',
    fontVariantNumeric: 'tabular-nums',
    color: opptrixTokens.textTertiary,
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
  },
  empty: {
    padding: `24px ${CONTENT_PAD}`,
    textAlign: 'center',
    fontSize: '12px',
    color: opptrixTokens.textTertiary,
    lineHeight: 1.5,
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
    gap: '8px',
    color: opptrixTokens.textTertiary,
    fontSize: '12px',
  },
})

interface PortfolioTabProps {
  active?: boolean
  selectedCode: string | null
  onSelect: (code: string) => void
}

function pnlColor(pct: number): string {
  const tone = pctTone(pct)
  if (tone === 'up') return MARKET_UP
  if (tone === 'down') return MARKET_DOWN
  return opptrixTokens.textSecondary
}

function formatShares(shares: number): string {
  if (!Number.isFinite(shares) || shares <= 0) return ''
  return shares % 1 === 0 ? `${shares} 股` : `${shares.toFixed(0)} 股`
}

export default function PortfolioTab({ active = true, selectedCode, onSelect }: PortfolioTabProps) {
  const s = useStyles()
  const [data, setData] = useState<PortfolioSummaryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const resp = await research.portfolioSummary()
      if (!resp.success || !resp.data) {
        throw new Error(resp.message || '组合数据加载失败')
      }
      setData(resp.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '组合数据加载失败')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (active) void load()
  }, [active, load])

  if (loading) {
    return (
      <div className={s.root}>
        <div className={s.center}>
          <Spinner size="tiny" />
          <Text>加载组合…</Text>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className={s.root}>
        <div className={s.empty}>
          <div>{error}</div>
          <OpptrixButton size="small" appearance="secondary" onClick={() => void load()} style={{ marginTop: 12 }}>
            重试
          </OpptrixButton>
        </div>
      </div>
    )
  }

  const holdings = data?.holdings ?? []
  const empty = holdings.length === 0

  return (
    <div className={s.root}>
      {!empty && data ? (
        <div className={s.summary}>
          <div className={s.metric}>
            <Text className={s.metricLabel}>总市值</Text>
            <Text className={s.metricValue}>{formatPrice(data.totalMarketValue)}</Text>
          </div>
          <div className={s.metric}>
            <Text className={s.metricLabel}>总盈亏</Text>
            <Text className={s.metricValue} style={{ color: pnlColor(data.totalPnlPct) }}>
              {formatPct(data.totalPnlPct)}
            </Text>
          </div>
          <div className={s.metric}>
            <Text className={s.metricLabel}>浮动盈亏</Text>
            <Text
              className={s.metricValue}
              style={{ color: pnlColor(data.totalUnrealizedPnl >= 0 ? 1 : -1) }}
            >
              {formatPrice(data.totalUnrealizedPnl)}
            </Text>
          </div>
          <div className={s.metric}>
            <Text className={s.metricLabel}>持仓</Text>
            <Text className={s.metricValue}>{data.holdingsCount} 只</Text>
          </div>
        </div>
      ) : null}

      <div className={mergeClasses(s.list, 'opptrix-scroll', 'opptrix-scroll-hover')}>
        {empty ? (
          <div className={s.empty}>
            暂无持仓
            <br />
            在个股详情录入买卖后，会在此汇总
          </div>
        ) : (
          holdings.map((h) => {
            const code = normalizeCode(h.code)
            const selected = selectedCode === code
            const sharesLabel = formatShares(h.shares)
            const note = sharesLabel ? `${code} · ${sharesLabel}` : code
            return (
              <div
                key={code}
                className={mergeClasses(s.row, 'opptrix-focusable', selected && s.rowActive)}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(code)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(code)
                  }
                }}
              >
                <div className={s.rowBody}>
                  <Text className={s.rowTitle}>{h.name}</Text>
                  <span className={s.rowNote}>{note}</span>
                </div>
                <div className={s.rowTrailing}>
                  <span className={s.quotePrimary} style={{ color: pnlColor(h.unrealizedPnlPct) }}>
                    {formatPct(h.unrealizedPnlPct)}
                  </span>
                  <span className={s.quoteSecondary}>{formatPrice(h.marketValue)}</span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
