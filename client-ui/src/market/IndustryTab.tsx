import { useCallback, useEffect, useMemo, useState } from 'react'
import { Input, Spinner, Tab, TabList, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ArrowLeftRegular, DismissRegular, SearchRegular } from '@fluentui/react-icons'
import { research } from '../api/client'
import type { IndustryMiningData, IndustryStatItem, IndustryStockItem } from '../types/schemas'
import type { MarketQuote, WatchlistItem } from '../types/market'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import MermaidBlock from '../chat/MermaidBlock'
import { formatPct, formatPrice, normalizeCode, pctTone } from './format'
import { industryDisplayName, industryMatchesFilter, industryMiningQuery } from './industryLabels'
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
  empty: {
    padding: `24px ${CONTENT_PAD}`,
    textAlign: 'center',
    fontSize: '11px',
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
): number | null {
  const code = normalizeCode(row.code)
  const live = quotes[code]?.changePct
  if (live != null) return live
  return row.change_pct
}

function sortStocksByChange(
  stocks: IndustryStockItem[],
  quotes: Record<string, MarketQuote>,
): IndustryStockItem[] {
  return [...stocks].sort((a, b) => {
    const pctA = stockChangePct(a, quotes)
    const pctB = stockChangePct(b, quotes)
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

export default function IndustryTab({ onSelectStock }: IndustryTabProps) {
  const s = useStyles()
  const [view, setView] = useState<'industries' | 'detail'>('industries')
  const [items, setItems] = useState<IndustryStatItem[]>([])
  const [tradeDate, setTradeDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')

  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<IndustryDetailTab>('stocks')
  const [stocks, setStocks] = useState<IndustryStockItem[]>([])
  const [stocksTradeDate, setStocksTradeDate] = useState<string | null>(null)
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
      setTradeDate(resp.data.quote_date ?? resp.data.trade_date ?? null)
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

  const filtered = useMemo(() => {
    const list = filter.trim()
      ? items.filter(it => industryMatchesFilter(it.industry, filter))
      : items
    return sortIndustriesByUpDown(list)
  }, [items, filter])

  const sortedStocks = useMemo(
    () => sortStocksByChange(stocks, quotes),
    [stocks, quotes],
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
      setStocksTradeDate(resp.data.trade_date ?? null)
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
    if (view !== 'detail' || detailTab !== 'stocks' || !stockCodes.length) return undefined
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
    const timer = window.setInterval(() => { void refresh() }, 60000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [view, detailTab, stockCodes])

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
        <div className={s.center}>
          <Spinner size="tiny" />
          <Text>加载行业统计…</Text>
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
              ? `${stocksLoading ? '加载成分股…' : `${stocks.length} 只成分股`}${stocksTradeDate ? ` · 行情 ${stocksTradeDate}` : ''}`
              : '产业链上下游结构与代表环节'}
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
            <div className={s.list}>
              {stocksLoading ? (
                <div className={s.center}>
                  <Spinner size="tiny" />
                  <Text>加载个股…</Text>
                </div>
              ) : stocks.length === 0 ? (
                <div className={s.empty}>
                  {stocksError ? '加载失败' : '该行业暂无个股'}
                  {stocksError ? (
                    <div style={{ marginTop: 12 }}>
                      <OpptrixButton
                        size="small"
                        variant="secondary"
                        onClick={() => void loadStocks(selectedIndustry)}
                      >
                        重试
                      </OpptrixButton>
                    </div>
                  ) : null}
                </div>
              ) : (
                sortedStocks.map(row => {
                  const code = normalizeCode(row.code)
                  const quote = quotes[code]
                  const price = quote?.price ?? row.price
                  const changePct = stockChangePct(row, quotes)
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
            <div className={s.chainPane}>
              {miningLoading ? (
                <div className={s.center}>
                  <Spinner size="tiny" />
                  <Text>生成产业链解读…</Text>
                </div>
              ) : miningError ? (
                <div className={s.empty}>
                  {miningError}
                  <div style={{ marginTop: 12 }}>
                    <OpptrixButton
                      size="small"
                      variant="secondary"
                      onClick={() => void loadMining(selectedIndustry)}
                    >
                      重试
                    </OpptrixButton>
                  </div>
                </div>
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
          按申万行业聚合本地因子库；点击行业查看成分股与产业链，再点个股进入详情。
        </Text>
        {tradeDate ? <Text className={s.meta}>行情日期 {tradeDate}</Text> : null}
        {error ? <Text className={s.meta} style={{ color: opptrixTokens.error }}>{error}</Text> : null}
      </div>

      <div className={s.list}>
        {filtered.length === 0 ? (
          <div className={s.empty}>
            {error
              ? '暂无行业数据'
              : items.length === 0
                ? '暂无行业数据，请先完成本地数据构建'
                : '未匹配到行业'}
          </div>
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
              </Text>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
