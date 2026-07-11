import { useCallback, useEffect, useState } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { BriefcaseRegular } from '@fluentui/react-icons'
import SidebarListEmpty from './SidebarListEmpty'
import { research } from '../api/client'
import type { PortfolioSummaryData } from '../types/schemas'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import { formatPct, formatPrice, formatPriceForMarket, pctTone, portfolioHoldingsKey } from './format'
import { instrumentKey, parseInstrumentInput } from './instrument'
import { marketDisplayName } from './instrument'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
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
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  metric: {
    padding: '5px 8px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.surfaceSubtle,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    minWidth: '72px',
    flex: '1 1 0',
    maxWidth: 'calc(50% - 3px)',
  },
  metricLabel: {
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
    fontWeight: 600,
    lineHeight: 1.3,
  },
  metricValue: {
    fontSize: '13px',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textPrimary,
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
  listCentered: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: '10px',
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
    color: opptrixCssVars.textPrimary,
    cursor: 'pointer',
    ...ghostInteractive,
    ':hover': {
      backgroundColor: opptrixCssVars.accentSoft,
    },
    ':focus-within': {
      backgroundColor: opptrixCssVars.accentSoft,
    },
  },
  rowActive: {
    ...sidebarItemSelected,
    ':hover': {
      backgroundColor: opptrixCssVars.accentSoft,
    },
    ':focus-within': {
      backgroundColor: opptrixCssVars.accentSoft,
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
    color: opptrixCssVars.textTertiary,
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
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
    gap: '8px',
    color: opptrixCssVars.textTertiary,
    fontSize: '12px',
  },
})

interface PortfolioTabProps {
  active?: boolean
  selectedCode: string | null
  onSelect: (code: string, market?: string) => void
}

function pnlColor(pct: number): string {
  const tone = pctTone(pct)
  if (tone === 'up') return MARKET_UP
  if (tone === 'down') return MARKET_DOWN
  return opptrixCssVars.textSecondary
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
        <div className={mergeClasses(s.list, s.listCentered)}>
          <div className={s.center}>
            <Spinner size="tiny" />
            <Text>正在加载组合…</Text>
          </div>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className={s.root}>
        <div className={mergeClasses(s.list, s.listCentered)}>
          <SidebarListEmpty
            icon={<BriefcaseRegular />}
            title="组合暂时加载不了"
            hint="请检查网络连接后重试"
            action={(
              <OpptrixButton size="small" appearance="secondary" onClick={() => void load()}>
                重试
              </OpptrixButton>
            )}
          />
        </div>
      </div>
    )
  }

  const holdings = data?.holdings ?? []
  const empty = holdings.length === 0

  return (
    <div className={s.root}>
      <div style={{ flexShrink: 0, padding: `6px ${CONTENT_PAD} 0` }}>
        <Text className={s.metricLabel} style={{ lineHeight: 1.45 }}>
          汇总 A 股、港股、美股的持仓市值与盈亏；在关注列表或详情页录入买卖后自动更新。
        </Text>
      </div>
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

      <div className={mergeClasses(s.list, 'opptrix-scroll', 'opptrix-scroll-hover', empty && s.listCentered)}>
        {empty ? (
          <SidebarListEmpty
            icon={<BriefcaseRegular />}
            title="还没有持仓记录"
            hint="在个股详情里录入买卖后，会在这里汇总市值与盈亏"
          />
        ) : (
          holdings.map((h) => {
            const displayCode = portfolioHoldingsKey(h.code, h.market)
            const marketLabel = h.market && h.market !== 'CN' ? marketDisplayName(h.market) : null
            const selected = selectedCode != null && (
              h.code === selectedCode
              || portfolioHoldingsKey(selectedCode, h.market) === displayCode
              || (() => {
                const parsed = parseInstrumentInput(selectedCode)
                return parsed ? instrumentKey(parsed) === instrumentKey({
                  market: (h.market ?? 'CN') as import('../types/instrument').Market,
                  assetClass: 'EQUITY',
                  symbol: h.code,
                }) : false
              })()
            )
            const sharesLabel = formatShares(h.shares)
            const note = [
              marketLabel ? `${marketLabel} · ${h.code}` : displayCode,
              sharesLabel,
            ].filter(Boolean).join(' · ')
            return (
              <div
                key={`${h.market ?? 'CN'}:${displayCode}`}
                className={mergeClasses(s.row, 'opptrix-focusable', selected && s.rowActive)}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(h.code, h.market)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(h.code, h.market)
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
                  <span className={s.quoteSecondary}>
                    {h.market && h.market !== 'CN'
                      ? formatPriceForMarket(h.market, h.marketValue)
                      : formatPrice(h.marketValue)}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
