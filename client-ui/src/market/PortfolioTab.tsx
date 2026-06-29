import { useCallback, useEffect, useState } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { research } from '../api/client'
import type { PortfolioSummaryData } from '../types/schemas'
import InnoButton from '../components/inno/InnoButton'
import { formatPct, formatPrice, normalizeCode, pctTone } from './format'
import { innoTokens } from '../theme/tokens'
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
  head: {
    flexShrink: 0,
    padding: `8px ${CONTENT_PAD} 10px`,
    borderBottom: `1px solid ${innoTokens.separator}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  headHint: {
    fontSize: '10px',
    color: innoTokens.textTertiary,
    lineHeight: 1.45,
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  },
  metric: {
    padding: '8px 10px',
    borderRadius: innoTokens.radiusMd,
    backgroundColor: innoTokens.surfaceSubtle,
  },
  metricLabel: {
    fontSize: '10px',
    color: innoTokens.textTertiary,
    marginBottom: '2px',
  },
  metricValue: {
    fontSize: '13px',
    fontWeight: 600,
    color: innoTokens.textPrimary,
  },
  list: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: `6px ${ITEM_BG_INSET}`,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: '6px',
    alignItems: 'center',
    padding: ITEM_INNER_PAD,
    borderRadius: innoTokens.radiusMd,
    cursor: 'pointer',
    marginBottom: '4px',
    ...ghostInteractive,
  },
  rowSelected: sidebarItemSelected,
  nameBlock: {
    minWidth: 0,
  },
  name: {
    fontSize: '12px',
    fontWeight: 500,
    color: innoTokens.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  code: {
    fontSize: '10px',
    color: innoTokens.textTertiary,
  },
  pnlBlock: {
    textAlign: 'right',
  },
  pnl: {
    fontSize: '12px',
    fontWeight: 500,
  },
  sub: {
    fontSize: '10px',
    color: innoTokens.textTertiary,
  },
  empty: {
    padding: `32px ${CONTENT_PAD}`,
    textAlign: 'center',
    fontSize: '11px',
    color: innoTokens.textTertiary,
    lineHeight: 1.5,
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
    gap: '8px',
    color: innoTokens.textTertiary,
    fontSize: '11px',
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
  return innoTokens.textSecondary
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
          <InnoButton size="small" appearance="secondary" onClick={() => void load()} style={{ marginTop: 12 }}>
            重试
          </InnoButton>
        </div>
      </div>
    )
  }

  const holdings = data?.holdings ?? []
  const empty = holdings.length === 0

  return (
    <div className={s.root}>
      <div className={s.head}>
        <Text className={s.headHint}>
          基于本地账本汇总持仓市值与盈亏；点击标的进入详情继续分析。
        </Text>
        {!empty && data ? (
          <div className={s.summaryGrid}>
            <div className={s.metric}>
              <Text className={s.metricLabel}>总市值</Text>
              <Text className={s.metricValue}>{formatPrice(data.totalMarketValue)}</Text>
            </div>
            <div className={s.metric}>
              <Text className={s.metricLabel}>总盈亏</Text>
              <Text
                className={s.metricValue}
                style={{ color: pnlColor(data.totalPnlPct) }}
              >
                {formatPct(data.totalPnlPct)}
              </Text>
            </div>
            <div className={s.metric}>
              <Text className={s.metricLabel}>持仓</Text>
              <Text className={s.metricValue}>{data.holdingsCount} 只</Text>
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
          </div>
        ) : null}
      </div>

      <div className={s.list}>
        {empty ? (
          <div className={s.empty}>
            暂无持仓记录
            <br />
            在个股详情中记录买卖后，组合将在此汇总展示。
          </div>
        ) : (
          holdings.map((h) => {
            const code = normalizeCode(h.code)
            const selected = selectedCode === code
            return (
              <div
                key={code}
                className={mergeClasses(s.row, selected && s.rowSelected)}
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
                <div className={s.nameBlock}>
                  <Text className={s.name}>{h.name}</Text>
                  <Text className={s.code}>{code}</Text>
                </div>
                <div className={s.pnlBlock}>
                  <Text className={s.pnl} style={{ color: pnlColor(h.unrealizedPnlPct) }}>
                    {formatPct(h.unrealizedPnlPct)}
                  </Text>
                  <Text className={s.sub}>{formatPrice(h.marketValue)}</Text>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
