import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { BriefcaseRegular } from '@fluentui/react-icons'
import SidebarListEmpty from './SidebarListEmpty'
import type { PortfolioSummaryData } from '../types/schemas'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import { formatPct, formatPrice, formatPriceForMarket, pctTone, portfolioHoldingsKey } from './format'
import { instrumentKey, marketDisplayName, tryParseInstrumentInput } from './instrument'
import { displayPortfolioHoldingReturnPct } from './portfolioCalc'
import type { Market } from '../types/instrument'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { ghostInteractive, sidebarItemSelected } from '../theme/mixins'
import { MARKET_DOWN, MARKET_UP } from './chartTheme'
import { listRowKey } from '../utils/listRowKey'
import { isSanePortfolioReturnPct } from '@opptrix/shared/portfolio-return'

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
    backgroundColor: opptrixCssVars.surfaceMuted,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    minWidth: '72px',
    flex: '1 1 0',
    maxWidth: 'calc(50% - 3px)',
  },
  metricLabel: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    fontWeight: 600,
    lineHeight: 1.3,
  },
  metricValue: {
    fontSize: 'var(--opptrix-font-base)',
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
  row: {...ghostInteractive,

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
':hover': {
      backgroundColor: opptrixCssVars.accentSoft,
    },
    ':focus-within': {
      backgroundColor: opptrixCssVars.accentSoft,
    },
  },
  rowActive: {...sidebarItemSelected,
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
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'left',
  },
  rowNote: {
    fontSize: 'var(--opptrix-font-xs)',
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
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
  },
  quoteSecondary: {
    fontSize: 'var(--opptrix-font-xs)',
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
    fontSize: 'var(--opptrix-font-md)',
  },
})

interface PortfolioTabProps {
  active?: boolean
  selectedCode: string | null
  onSelect: (code: string, market?: string) => void
  summary: PortfolioSummaryData | null
  loading: boolean
  error: string
  onRetry: () => void
}

function pnlColor(pct: number | null | undefined): string {
  const tone = pctTone(pct)
  if (tone === 'up') return MARKET_UP
  if (tone === 'down') return MARKET_DOWN
  return opptrixCssVars.textSecondary
}

function formatShares(shares: number): string {
  if (!Number.isFinite(shares) || shares <= 0) return ''
  return shares % 1 === 0 ? `${shares} 股` : `${shares.toFixed(0)} 股`
}

export default function PortfolioTab({
  active = true,
  selectedCode,
  onSelect,
  summary,
  loading,
  error,
  onRetry,
}: PortfolioTabProps) {
  const s = useStyles()

  if (!active) {
    return <div className={s.root} />
  }

  if (loading && !summary) {
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

  if (error && !summary) {
    return (
      <div className={s.root}>
        <div className={mergeClasses(s.list, s.listCentered)}>
          <SidebarListEmpty
            icon={<BriefcaseRegular />}
            title="组合暂时加载不了"
            hint="请检查网络后重试"
            action={(
              <OpptrixButton size="small" appearance="secondary" onClick={onRetry}>
                重试
              </OpptrixButton>
            )}
          />
        </div>
      </div>
    )
  }

  const data = summary
  const holdings = data?.holdings ?? []
  const empty = holdings.length === 0
  const totalPnlPct = isSanePortfolioReturnPct(data?.totalPnlPct) ? data?.totalPnlPct : null

  return (
    <div className={s.root}>
      {!empty && data ? (
        <div className={s.summary}>
          <div className={s.metric}>
            <Text className={s.metricLabel}>总市值</Text>
            <Text className={s.metricValue}>{formatPrice(data.totalMarketValue)}</Text>
          </div>
          <div className={s.metric}>
            <Text className={s.metricLabel}>总收益</Text>
            <Text className={s.metricValue} style={{ color: pnlColor(totalPnlPct) }}>
              {formatPct(totalPnlPct)}
            </Text>
          </div>
          <div className={s.metric}>
            <Text className={s.metricLabel}>浮动盈亏</Text>
            <Text
              className={s.metricValue}
              style={{ color: pnlColor(data.totalUnrealizedPnl) }}
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
            hint="在个股或 ETF 详情里录入买卖后，会在这里汇总市值与盈亏"
          />
        ) : (
          holdings.map((h, index) => {
            const displayCode = portfolioHoldingsKey(h.code, h.market)
            const marketLabel = h.market && h.market !== 'CN' ? marketDisplayName(h.market as Market) : null
            const selected = selectedCode != null && (
              h.code === selectedCode
              || portfolioHoldingsKey(selectedCode, h.market) === displayCode
              || (() => {
                const parsed = tryParseInstrumentInput(selectedCode)
                if (!parsed) return false
                const market = (h.market ?? 'CN') as Market
                const holdingRef = market === 'CN'
                  ? tryParseInstrumentInput(h.code)
                  : { market, assetClass: 'EQUITY' as const, symbol: h.code }
                return holdingRef ? instrumentKey(parsed) === instrumentKey(holdingRef) : false
              })()
            )
            const sharesLabel = formatShares(h.shares)
            const note = [
              marketLabel ? `${marketLabel} · ${h.code}` : displayCode,
              sharesLabel,
            ].filter(Boolean).join(' · ')
            const rowReturnPct = displayPortfolioHoldingReturnPct(h, h.currentPrice)
            return (
              <div
                key={listRowKey(index, h.market, displayCode)}
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
                  <span className={s.quotePrimary} style={{ color: pnlColor(rowReturnPct) }}>
                    {formatPct(rowReturnPct)}
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
