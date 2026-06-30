import { useCallback, useEffect, useMemo, useState } from 'react'
import { Input, Spinner, Tab, TabList, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ArrowLeftRegular, BuildingRegular, DismissRegular, OrganizationRegular, SearchRegular } from '@fluentui/react-icons'
import SidebarListEmpty from './SidebarListEmpty'
import { research } from '../api/client'
import type { IndustryMiningData, IndustryStatItem, IndustryStockItem } from '../types/schemas'
import type { MarketQuote, WatchlistItem } from '../types/market'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import MermaidBlock from '../chat/MermaidBlock'
import { formatPct, formatPrice, normalizeCode, pctTone } from './format'
import { industryDisplayName, industryMatchesFilter, industryMiningQuery } from './industryLabels'
import {
  INDUSTRY_QUOTES_POLL_MS,
  INDUSTRY_STATS_POLL_MS,
  shouldUseLiveIndustryQuotes,
} from './chartLiveRefresh'
import { opptrixTokens } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'
import { MARKET_DOWN, MARKET_UP } from './chartTheme'

const CONTENT_PAD = '15px'
const ITEM_BG_INSET = '10px'
const ITEM_INNER_PAD = '10px'

type IndustryDetailTab = 'stocks' | 'chain'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
  },
  head: {
    flexShrink: 0,
    padding: `6px ${CONTENT_PAD} 8px`,
    borderBottom: `1px solid ${opptrixTokens.separator}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  headRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  backBtn: {
    flexShrink: 0,
    minWidth: '28px',
    minHeight: '28px',
    padding: 0,
  },
  headTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: opptrixTokens.textPrimary,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  headHint: {
    fontSize: '10px',
    color: opptrixTokens.textTertiary,
    lineHeight: 1.45,
  },
  tabBar: {
    flexShrink: 0,
    padding: `0 ${CONTENT_PAD}`,
    borderBottom: `1px solid ${opptrixTokens.separator}`,
  },
  tabList: {
    minHeight: '32px',
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  searchRow: {
    padding: `8px ${CONTENT_PAD} 6px`,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    borderBottom: `1px solid ${opptrixTokens.separator}`,
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
  },
  iconBtn: {
    border: 'none',
    background: 'transparent',
    color: opptrixTokens.textTertiary,
    cursor: 'pointer',
    padding: '2px',
    lineHeight: 0,
    flexShrink: 0,
    ...ghostInteractive,
  },
  meta: {
    fontSize: '10px',
    color: opptrixTokens.textTertiary,
  },
  list: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: `0 ${ITEM_BG_INSET}`,
    display: 'flex',
    flexDirection: 'column',
  },
  listCentered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: `10px ${ITEM_BG_INSET}`,
  },
  listItem: {
    borderBottom: `1px solid ${opptrixTokens.separator}`,
    ':last-child': { borderBottom: 'none' },
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr auto auto',
    gap: '8px',
    alignItems: 'center',
    padding: ITEM_INNER_PAD,
    marginBottom: 0,
    cursor: 'pointer',
    ...ghostInteractive,
    borderRadius: 0,
  },
  stockRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: ITEM_INNER_PAD,
    marginBottom: 0,
    cursor: 'pointer',
    ...ghostInteractive,
    borderRadius: 0,
  },
  industryName: {
    fontSize: '12px',
    fontWeight: 500,
    color: opptrixTokens.textPrimary,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  stockBody: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  stockName: {
    fontSize: '12px',
    fontWeight: 500,
    color: opptrixTokens.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  stockMeta: {
    fontSize: '10px',
    color: opptrixTokens.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  stat: {
    fontSize: '10px',
    color: opptrixTokens.textSecondary,
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  upDown: {
    fontSize: '10px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  },
  quoteBlock: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '1px',
    minWidth: '72px',
  },
  quotePrice: {
    fontSize: '11px',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixTokens.textPrimary,
  },
  quotePct: {
    fontSize: '10px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  pctUp: { color: MARKET_UP },
  pctDown: { color: MARKET_DOWN },
  pctFlat: { color: opptrixTokens.textTertiary },
  chainPane: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: `10px ${CONTENT_PAD} 12px`,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chainPaneFilled: {
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  chainSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  chainSectionTitle: {
    fontSize: '11px',
    fontWeight: 650,
    color: opptrixTokens.textPrimary,
  },
  chainText: {
    fontSize: '11px',
    color: opptrixTokens.textSecondary,
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
    gap: '8px',
    color: opptrixTokens.textTertiary,
    fontSize: '11px',
  },
})

interface IndustryTabProps {
  onSelectStock?: (item: WatchlistItem) => void
}

function pctClass(s: ReturnType<typeof useStyles>, value: number | null | undefined) {
  const tone = pctTone(value)
  if (tone === 'up') return s.pctUp
  if (tone === 'down') return s.pctDown
  return s.pctFlat
}

function stockChangePct(
  row: IndustryStockItem,
  quotes: Record<string, MarketQuote>,
  useLive: boolean,
): number | null {
  if (useLive) {
    const code = normalizeCode(row.code)
    const live = quotes[code]?.changePct
    if (live != null) return live
  }
  return row.change_pct
}

function sortStocksByChange(
  stocks: IndustryStockItem[],
  quotes: Record<string, MarketQuote>,
  useLive: boolean,
): IndustryStockItem[] {
  return [...stocks].sort((a, b) => {
    const pctA = stockChangePct(a, quotes, useLive)
    const pctB = stockChangePct(b, quotes, useLive)
    if (pctA == null && pctB == null) return normalizeCode(a.code).localeCompare(normalizeCode(b.code))
    if (pctA == null) return 1
    if (pctB == null) return -1
    if (pctB !== pctA) return pctB - pctA
    return normalizeCode(a.code).localeCompare(normalizeCode(b.code))
  })
}

function sortIndustriesByUpDown(items: IndustryStatItem[]): IndustryStatItem[] {
  return [...items].sort((a, b) => {
    const upDiff = (b.up_count ?? 0) - (a.up_count ?? 0)
    if (upDiff !== 0) return upDiff
    const downDiff = (a.down_count ?? 0) - (b.down_count ?? 0)
    if (downDiff !== 0) return downDiff
    return b.stock_count - a.stock_count
  })
}

function quoteStatusHint(quoteDate: string | null, useLive: boolean): string {
  if (useLive) return '盘中实时 · 约每分钟更新'
  if (quoteDate) return `行情截至 ${quoteDate}`
  return ''
}

export default function IndustryTab({ onSelectStock }: IndustryTabProps) {
  const s = useStyles()
  const [view, setView] = useState<'industries' | 'detail'>('industries')
  const [items, setItems] = useState<IndustryStatItem[]>([])
  const [tradeDate, setTradeDate] = useState<string | null>(null)
  const [quoteDate, setQuoteDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')

  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<IndustryDetailTab>('stocks')
  const [stocks, setStocks] = useState<IndustryStockItem[]>([])
  const [stocksQuoteDate, setStocksQuoteDate] = useState<string | null>(null)
  const [stocksLoading, setStocksLoading] = useState(false)
  const [stocksError, setStocksError] = useState('')
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({})

  const [mining, setMining] = useState<IndustryMiningData | null>(null)
  const [miningLoading, setMiningLoading] = useState(false)
  const [miningError, setMiningError] = useState('')
  const [miningLoadedFor, setMiningLoadedFor] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const resp = await research.marketIndustryStats()
      if (!resp.success || !resp.data) {
        throw new Error(resp.message || '行业数据加载失败')
      }
      setItems(resp.data.items ?? [])
      setTradeDate(resp.data.trade_date ?? null)
      setQuoteDate(resp.data.quote_date ?? resp.data.trade_date ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '行业数据加载失败')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  const useLiveList = shouldUseLiveIndustryQuotes(quoteDate)

  useEffect(() => {
    if (!useLiveList) return undefined
    const timer = window.setInterval(() => { void loadStats() }, INDUSTRY_STATS_POLL_MS)
    return () => window.clearInterval(timer)
  }, [useLiveList, loadStats])

  const filtered = useMemo(() => {
    const list = filter.trim()
      ? items.filter(it => industryMatchesFilter(it.industry, filter))
      : items
    return sortIndustriesByUpDown(list)
  }, [items, filter])

  const useLiveStocks = shouldUseLiveIndustryQuotes(stocksQuoteDate)

  const sortedStocks = useMemo(
    () => sortStocksByChange(stocks, quotes, useLiveStocks),
    [stocks, quotes, useLiveStocks],
  )

  const loadStocks = useCallback(async (industry: string) => {
    setStocksLoading(true)
    setStocksError('')
    setStocks([])
    setQuotes({})
    try {
      const resp = await research.industryStocks(industry)
      if (!resp.success || !resp.data) {
        throw new Error(resp.message || '个股列表加载失败')
      }
      setStocks(resp.data.items ?? [])
      setStocksQuoteDate(resp.data.quote_date ?? resp.data.trade_date ?? null)
    } catch (e) {
      setStocksError(e instanceof Error ? e.message : '个股列表加载失败')
      setStocks([])
    } finally {
      setStocksLoading(false)
    }
  }, [])

  const loadMining = useCallback(async (industry: string) => {
    setMiningLoading(true)
    setMiningError('')
    setMining(null)
    try {
      const resp = await research.industryMining(industryMiningQuery(industry))
      if (!resp.success || !resp.data) {
        throw new Error(resp.message || '产业链解读加载失败')
      }
      setMining(resp.data)
      setMiningLoadedFor(industry)
    } catch (e) {
      setMiningError(e instanceof Error ? e.message : '产业链解读加载失败')
      setMiningLoadedFor(null)
    } finally {
      setMiningLoading(false)
    }
  }, [])

  const pickIndustry = useCallback((industry: string) => {
    setSelectedIndustry(industry)
    setView('detail')
    setDetailTab('stocks')
    setFilter('')
    setMining(null)
    setMiningError('')
    setMiningLoadedFor(null)
    void loadStocks(industry)
  }, [loadStocks])

  const backToIndustries = useCallback(() => {
    setView('industries')
    setSelectedIndustry(null)
    setDetailTab('stocks')
    setStocks([])
    setStocksError('')
    setStocksQuoteDate(null)
    setQuotes({})
    setMining(null)
    setMiningError('')
    setMiningLoadedFor(null)
  }, [])

  const stockCodes = useMemo(
    () => stocks.map(row => normalizeCode(row.code)),
    [stocks],
  )

  useEffect(() => {
    if (!useLiveStocks || view !== 'detail' || detailTab !== 'stocks' || !stockCodes.length) return undefined
    let cancelled = false
    const refresh = async () => {
      try {
        const resp = await research.stockQuotes(stockCodes)
        if (cancelled || !resp.success || !resp.data?.quotes) return
        const map: Record<string, MarketQuote> = {}
        for (const q of resp.data.quotes) map[normalizeCode(q.code)] = q
        setQuotes(map)
      } catch {
        /* ignore transient quote errors */
      }
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, INDUSTRY_QUOTES_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [useLiveStocks, view, detailTab, stockCodes])

  useEffect(() => {
    if (view !== 'detail' || detailTab !== 'chain' || !selectedIndustry) return
    if (miningLoadedFor === selectedIndustry || miningLoading) return
    void loadMining(selectedIndustry)
  }, [view, detailTab, selectedIndustry, miningLoadedFor, miningLoading, loadMining])

  const pickStock = useCallback((row: IndustryStockItem) => {
    onSelectStock?.({
      code: normalizeCode(row.code),
      name: row.name,
      industry: row.industry ?? undefined,
    })
  }, [onSelectStock])

  if (loading) {
    return (
      <div className={s.root}>
        <div className={mergeClasses(s.list, s.listCentered)}>
          <div className={s.center}>
            <Spinner size="tiny" />
            <Text>正在加载行业涨跌…</Text>
          </div>
        </div>
      </div>
    )
  }

  if (view === 'detail' && selectedIndustry) {
    const title = industryDisplayName(selectedIndustry)
    return (
      <div className={s.root}>
        <div className={s.head}>
          <div className={s.headRow}>
            <OpptrixButton
              className={s.backBtn}
              variant="icon"
              size="small"
              icon={<ArrowLeftRegular fontSize={14} />}
              aria-label="返回行业列表"
              onClick={backToIndustries}
            />
            <Text className={s.headTitle}>{title}</Text>
          </div>
          <Text className={s.headHint}>
          {detailTab === 'stocks'
            ? `${stocksLoading ? '正在加载成分股…' : `共 ${stocks.length} 只成分股`}${quoteStatusHint(stocksQuoteDate, useLiveStocks) ? ` · ${quoteStatusHint(stocksQuoteDate, useLiveStocks)}` : ''}`
            : '了解这个行业上下游有哪些环节与代表公司'}
        </Text>
          {detailTab === 'stocks' && stocksError ? (
            <Text className={s.meta} style={{ color: opptrixTokens.error }}>{stocksError}</Text>
          ) : null}
        </div>

        <div className={s.tabBar}>
          <TabList
            className={s.tabList}
            size="small"
            selectedValue={detailTab}
            onTabSelect={(_, data) => setDetailTab(data.value as IndustryDetailTab)}
          >
            <Tab value="stocks">个股</Tab>
            <Tab value="chain">上下游</Tab>
          </TabList>
        </div>

        <div className={s.body}>
          {detailTab === 'stocks' ? (
            <div className={mergeClasses(s.list, (stocksLoading || stocks.length === 0) && s.listCentered)}>
              {stocksLoading ? (
                <div className={s.center}>
                  <Spinner size="tiny" />
                  <Text>正在加载成分股…</Text>
                </div>
              ) : stocks.length === 0 ? (
                <SidebarListEmpty
                  icon={<OrganizationRegular />}
                  title={stocksError ? '成分股暂时加载不了' : '这个行业暂无成分股'}
                  hint={stocksError ? '请检查网络后重试' : '可以返回列表，试试其他行业'}
                  action={stocksError ? (
                    <OpptrixButton
                      size="small"
                      variant="secondary"
                      onClick={() => void loadStocks(selectedIndustry)}
                    >
                      重试
                    </OpptrixButton>
                  ) : undefined}
                />
              ) : (
                sortedStocks.map(row => {
                  const code = normalizeCode(row.code)
                  const quote = useLiveStocks ? quotes[code] : undefined
                  const price = quote?.price ?? row.price
                  const changePct = stockChangePct(row, quotes, useLiveStocks)
                  return (
                    <div
                      key={code}
                      className={mergeClasses(s.stockRow, s.listItem)}
                      role="button"
                      tabIndex={0}
                      onClick={() => pickStock(row)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          pickStock(row)
                        }
                      }}
                    >
                      <div className={s.stockBody}>
                        <Text className={s.stockName}>{row.name}</Text>
                        <Text className={s.stockMeta}>
                          {code}
                          {row.total_score != null ? ` · 评分 ${row.total_score.toFixed(1)}` : ''}
                        </Text>
                      </div>
                      <div className={s.quoteBlock}>
                        <Text className={s.quotePrice}>{formatPrice(price)}</Text>
                        <Text className={mergeClasses(s.quotePct, pctClass(s, changePct))}>
                          {formatPct(changePct)}
                        </Text>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          ) : (
            <div className={mergeClasses(s.chainPane, mining && s.chainPaneFilled)}>
              {miningLoading ? (
                <div className={s.center}>
                  <Spinner size="tiny" />
                  <Text>正在整理产业链解读…</Text>
                </div>
              ) : miningError ? (
                <SidebarListEmpty
                  icon={<BuildingRegular />}
                  title="产业链解读暂时生成不了"
                  hint="请稍后再试，或换一天再看"
                  action={(
                    <OpptrixButton
                      size="small"
                      variant="secondary"
                      onClick={() => void loadMining(selectedIndustry)}
                    >
                      重试
                    </OpptrixButton>
                  )}
                />
              ) : mining ? (
                <>
                  {mining.summary ? (
                    <div className={s.chainSection}>
                      <Text className={s.chainSectionTitle}>核心摘要</Text>
                      <Text className={s.chainText}>{mining.summary}</Text>
                    </div>
                  ) : null}
                  {mining.chain_overview ? (
                    <div className={s.chainSection}>
                      <Text className={s.chainSectionTitle}>产业链全景</Text>
                      <Text className={s.chainText}>{mining.chain_overview}</Text>
                    </div>
                  ) : null}
                  {mining.mermaid ? (
                    <div className={s.chainSection}>
                      <Text className={s.chainSectionTitle}>结构图</Text>
                      <MermaidBlock code={mining.mermaid} />
                    </div>
                  ) : null}
                  {mining.key_companies > 0 ? (
                    <Text className={s.meta}>覆盖重点公司 {mining.key_companies} 家</Text>
                  ) : null}
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={s.root}>
      <div className={s.searchRow}>
        <Input
          className={s.searchInput}
          appearance="filled-darker"
          size="small"
          placeholder="筛选行业"
          value={filter}
          onChange={(_e, d) => setFilter(d.value)}
          contentBefore={<SearchRegular fontSize={14} />}
        />
        {filter ? (
          <button type="button" className={s.iconBtn} aria-label="清除筛选" onClick={() => setFilter('')}>
            <DismissRegular fontSize={14} />
          </button>
        ) : null}
      </div>

      <div className={s.head}>
        <Text className={s.headHint}>
          按行业查看涨跌与成分股，点行业名可进入详情，再点个股可看走势。
        </Text>
        {quoteStatusHint(quoteDate, useLiveList) ? (
          <Text className={s.meta}>{quoteStatusHint(quoteDate, useLiveList)}</Text>
        ) : null}
        {tradeDate && tradeDate !== quoteDate ? (
          <Text className={s.meta}>因子日期 {tradeDate}</Text>
        ) : null}
        {error ? <Text className={s.meta} style={{ color: opptrixTokens.error }}>{error}</Text> : null}
      </div>

      <div className={mergeClasses(s.list, filtered.length === 0 && s.listCentered)}>
        {filtered.length === 0 ? (
          <SidebarListEmpty
            icon={<BuildingRegular />}
            title={
              error
                ? '行业数据暂时不可用'
                : items.length === 0
                  ? '暂时还没有行业数据'
                  : '没有符合条件的行业'
            }
            hint={
              error
                ? '请检查网络后重试，或稍后再打开此页'
                : items.length === 0
                  ? '请先在设置里准备好本地行情，完成后这里会显示各行业涨跌'
                  : '换个关键词试试，或清空上方筛选'
            }
          />
        ) : (
          filtered.map(it => (
            <div
              key={it.industry}
              className={mergeClasses(s.row, s.listItem)}
              role="button"
              tabIndex={0}
              onClick={() => pickIndustry(it.industry)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  pickIndustry(it.industry)
                }
              }}
            >
              <Text className={s.industryName}>{industryDisplayName(it.industry)}</Text>
              <Text className={s.stat}>{it.stock_count} 只</Text>
              <Text className={s.upDown}>
                <span className={s.pctUp}>{it.up_count ?? 0}涨</span>
                {' '}
                <span className={s.pctDown}>{it.down_count ?? 0}跌</span>
                {(it.flat_count ?? 0) > 0 ? (
                  <>
                    {' '}
                    <span className={s.pctFlat}>{it.flat_count}平</span>
                  </>
                ) : null}
              </Text>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
