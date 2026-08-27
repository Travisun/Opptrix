import { useMemo } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { BriefcaseRegular } from '@fluentui/react-icons'
import SidebarListEmpty from './SidebarListEmpty'
import type { PortfolioSummaryData } from '../types/schemas'
import type { WatchlistItem } from '../types/market'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import { formatMoney, formatPct, pctTone, portfolioHoldingsKey } from './format'
import { instrumentKey, marketDisplayName, tryParseInstrumentInput } from './instrument'
import { displayPortfolioHoldingReturnPct } from './portfolioCalc'
import {
  aggregatePortfolioScopeSummary,
  resolvePortfolioHoldingsForGroup,
} from './portfolioGroupCalc'
import {
  portfolioHoldingDisplayCode,
  portfolioHoldingDisplayName,
} from './portfolioWatchlist'
import { useWatchlistGroups } from './WatchlistGroupsContext'
import WatchlistGroupFilterBar from './WatchlistGroupFilterBar'
import WatchlistGroupSummaryStrip from './WatchlistGroupSummaryStrip'
import WatchlistGroupsDrawer from './WatchlistGroupsDrawer'
import type { HoldingSnapshot } from './useFollowPortfolio'
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
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
  },
  chipRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: `8px ${CONTENT_PAD} 6px`,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    minWidth: 0,
    minHeight: '34px',
    boxSizing: 'border-box',
    flexShrink: 0,
  },
  chipsWrap: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    overflowX: 'auto',
    overflowY: 'hidden',
  },
  chip: {...ghostInteractive,
    flexShrink: 0,
    height: '26px',
    padding: '0 10px',
    border: 'none',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: 'transparent',
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      color: opptrixCssVars.textPrimary,
    },
  },
  chipActive: {
    backgroundColor: opptrixCssVars.accentSoft,
    color: opptrixCssVars.accent,
    ':hover': {
      backgroundColor: opptrixCssVars.accentSoft,
      color: opptrixCssVars.accent,
    },
  },
  chipEditBtn: {...ghostInteractive,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    padding: 0,
    border: 'none',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: 'transparent',
    color: opptrixCssVars.textTertiary,
    cursor: 'pointer',
    lineHeight: 0,
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      color: opptrixCssVars.textPrimary,
    },
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
  footer: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: `6px ${CONTENT_PAD} 8px`,
    borderTop: `1px solid ${opptrixCssVars.separator}`,
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
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
  watchlistItems: WatchlistItem[]
  holdingsByCode: Record<string, HoldingSnapshot>
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
  watchlistItems,
  holdingsByCode,
}: PortfolioTabProps) {
  const s = useStyles()
  const {
    groups,
    membership,
    selectedGroupId,
    setSelectedGroupId,
    dialogOpen,
    setDialogOpen,
    replaceDoc,
  } = useWatchlistGroups()

  const groupsDoc = useMemo(
    () => ({ groups, membership }),
    [groups, membership],
  )

  const selectedGroupTitle = useMemo(
    () => groups.find(g => g.id === selectedGroupId)?.title ?? null,
    [groups, selectedGroupId],
  )

  const allHoldings = summary?.holdings ?? []

  const scopedHoldings = useMemo(
    () => resolvePortfolioHoldingsForGroup(
      allHoldings,
      watchlistItems,
      membership,
      selectedGroupId,
      holdingsByCode,
    ),
    [allHoldings, watchlistItems, membership, selectedGroupId, holdingsByCode],
  )

  const scopeSummary = useMemo(
    () => (selectedGroupId
      ? aggregatePortfolioScopeSummary(scopedHoldings)
      : summary
        ? {
          totalCost: summary.totalCost,
          totalMarketValue: summary.totalMarketValue,
          totalUnrealizedPnl: summary.totalUnrealizedPnl,
          totalRealizedPnl: summary.totalRealizedPnl,
          totalPnl: summary.totalPnl,
          totalPnlPct: summary.totalPnlPct,
          holdingsCount: summary.holdingsCount,
        }
        : null),
    [selectedGroupId, scopedHoldings, summary],
  )

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

  const holdings = selectedGroupId ? scopedHoldings : allHoldings
  const empty = holdings.length === 0
  const displaySummary = scopeSummary
  const totalPnlPct = isSanePortfolioReturnPct(displaySummary?.totalPnlPct)
    ? displaySummary?.totalPnlPct
    : null

  return (
    <div className={s.root}>
      <WatchlistGroupFilterBar
        groups={groups}
        membership={membership}
        items={watchlistItems}
        selectedGroupId={selectedGroupId}
        onSelectGroup={setSelectedGroupId}
        onManage={() => setDialogOpen(true)}
      />

      {!empty && displaySummary ? (
        <WatchlistGroupSummaryStrip
          mode="portfolio"
          metrics={{ itemCount: 0, holdingCount: 0, holdingReturnPct: null }}
          groupTitle={selectedGroupTitle}
          portfolioSummary={displaySummary ? {
            totalMarketValue: displaySummary.totalMarketValue,
            totalPnlPct: totalPnlPct ?? null,
            totalUnrealizedPnl: displaySummary.totalUnrealizedPnl,
            holdingsCount: displaySummary.holdingsCount,
          } : null}
          formatMoney={formatMoney}
        />
      ) : null}

      <div className={mergeClasses(s.list, 'opptrix-scroll', 'opptrix-scroll-hover', empty && s.listCentered)}>
        {empty ? (
          <SidebarListEmpty
            icon={<BriefcaseRegular />}
            title={
              selectedGroupTitle
                ? `「${selectedGroupTitle}」暂无持仓`
                : '还没有持仓记录'
            }
            hint={
              selectedGroupTitle
                ? '该分组内的关注标的尚未录入买卖，或切换到「全部」查看其他持仓'
                : '在个股或 ETF 详情里录入买卖后，会在这里汇总市值与盈亏'
            }
          />
        ) : (
          holdings.map((h, index) => {
            const displayCode = portfolioHoldingDisplayCode(h, watchlistItems)
            const displayName = portfolioHoldingDisplayName(h, watchlistItems)
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
                  <Text className={s.rowTitle}>{displayName}</Text>
                  <span className={s.rowNote}>{note}</span>
                </div>
                <div className={s.rowTrailing}>
                  <span className={s.quotePrimary} style={{ color: pnlColor(rowReturnPct) }}>
                    {formatPct(rowReturnPct)}
                  </span>
                  <span className={s.quoteSecondary}>
                    {formatMoney(h.marketValue)}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {!empty && displaySummary ? (
        <div className={s.footer}>
          <span>
            {selectedGroupTitle
              ? `${holdings.length} 只 · ${selectedGroupTitle}`
              : `${displaySummary.holdingsCount} 只 · 全部组合`}
          </span>
        </div>
      ) : null}

      <WatchlistGroupsDrawer
        open={dialogOpen}
        items={watchlistItems}
        doc={groupsDoc}
        onClose={() => setDialogOpen(false)}
        onSave={replaceDoc}
      />
    </div>
  )
}
