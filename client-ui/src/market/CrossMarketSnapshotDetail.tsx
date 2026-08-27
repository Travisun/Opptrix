import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { EditRegular } from '@fluentui/react-icons'
import { research } from '../api/client'
import { quoteDtoToCrossMarket } from './instrument-adapters'
import type { CryptoSnapshotData, UsSnapshotData, WatchlistItem } from '../types/market'
import type { InstrumentRef } from '../types/instrument'
import {
  formatCompactNumberForMarket,
  formatPct,
  formatPriceForMarket,
  formatSignedNumber,
  formatVolume,
  pctTone,
} from './format'
import {
  displayCodeFromInstrument,
  formatInstrumentLabel,
  instrumentKey,
  marketDisplayName,
  resolveWatchlistInstrument,
  UNRESOLVED_INSTRUMENT_COPY,
  watchlistItemKey,
} from './instrument'
import { hasApplicationCapability } from './capabilities'
import { isWatchlistItemWithinQuoteGrace } from './watchlistQuotes'
import TradingViewChart from './TradingViewChart'
import { DETAIL_PANEL_CHART_MAX_HEIGHT_PX } from './chartViewConfig'
import { mergeSnapshotPreserveQuote } from './detailSnapshotUtils'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'
import { listRowKey } from '../utils/listRowKey'

const CONTENT_PAD = '15px'
const SNAPSHOT_INITIAL_MAX_RETRIES = 2
const SNAPSHOT_INITIAL_RETRY_MS = 1500
const SNAPSHOT_LOAD_ERROR_COPY = '暂时无法加载行情，请稍后重试'

type EquityDetail = UsSnapshotData

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
  },
  hero: {
    flexShrink: 0,
    padding: `6px ${CONTENT_PAD} 5px`,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '6px',
    minWidth: 0,
  },
  titleMain: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '6px',
    minWidth: 0,
    overflow: 'hidden',
    flex: 1,
  },
  name: {
    fontSize: 'var(--opptrix-font-lg)',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  code: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
  },
  badge: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: opptrixCssVars.accentSoft,
    color: opptrixCssVars.textSecondary,
    flexShrink: 0,
  },
  quoteMain: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  manageBtn: {
    ...ghostInteractive,
    border: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    color: opptrixCssVars.textSecondary,
    borderRadius: opptrixTokens.radiusSm,
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    padding: '3px 7px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    lineHeight: 1.2,
  },
  price: {
    fontSize: 'var(--opptrix-font-3xl)',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.1,
  },
  change: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  pctUp: { color: '#FF3B30' },
  pctDown: { color: '#34C759' },
  pctFlat: { color: opptrixCssVars.textTertiary },
  heroGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '2px 6px',
  },
  heroCell: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '4px',
    minWidth: 0,
  },
  heroLabel: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
  },
  heroValue: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  chartBody: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  cryptoBody: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: `8px ${CONTENT_PAD} 10px`,
  },
  chartPanel: {
    flexShrink: 0,
    maxHeight: `${DETAIL_PANEL_CHART_MAX_HEIGHT_PX}px`,
    minHeight: '200px',
    padding: `4px ${CONTENT_PAD} 8px`,
    overflow: 'hidden',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '8px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.canvasAlt,
  },
  cardTitle: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 650,
    color: opptrixCssVars.textTertiary,
  },
  foot: {
    flexShrink: 0,
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
  error: {
    flexShrink: 0,
    padding: `0 ${CONTENT_PAD}`,
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.error,
  },
  muted: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
  },
  klineRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '3px',
    height: '72px',
    paddingTop: '4px',
  },
  klineBar: {
    flex: '1 1 0',
    minWidth: '4px',
    borderRadius: '2px 2px 0 0',
    backgroundColor: opptrixCssVars.accent,
    opacity: 0.85,
  },
  klineBarDown: {
    backgroundColor: '#34C759',
    opacity: 0.75,
  },
})

interface Props {
  stock: WatchlistItem
  instrumentRef?: InstrumentRef
  loading?: boolean
  onManage?: () => void
  onSelectPeer?: (item: WatchlistItem) => void
}

function HeroCell({ label, value }: { label: string; value: string }) {
  const s = useStyles()
  return (
    <div className={s.heroCell}>
      <span className={s.heroLabel}>{label}</span>
      <span className={s.heroValue}>{value}</span>
    </div>
  )
}

function MiniKline({
  bars,
  formatPriceLabel,
}: {
  bars: { close: number; changePct: number | null }[]
  formatPriceLabel: (value: number) => string
}) {
  const s = useStyles()
  const values = bars.map(b => b.close).filter(v => Number.isFinite(v))
  if (values.length < 2) return <Text className={s.muted}>暂无 K 线</Text>
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return (
    <div className={s.klineRow}>
      {bars.map((bar, i) => {
        const h = Math.max(8, Math.round(((bar.close - min) / span) * 64))
        const down = (bar.changePct ?? 0) < 0
        return (
          <div
            key={listRowKey(i, bar.close)}
            className={mergeClasses(s.klineBar, down ? s.klineBarDown : undefined)}
            style={{ height: `${h}px` }}
            title={formatPriceLabel(bar.close)}
          />
        )
      })}
    </div>
  )
}

async function loadSnapshot(
  ref: InstrumentRef,
  opts?: { fresh?: boolean },
): Promise<EquityDetail | CryptoSnapshotData> {
  if (!hasApplicationCapability(ref, 'snapshot')) {
    throw new Error('该标的暂不支持快照')
  }
  const resp = await research.instrumentSnapshot(ref, { fresh: opts?.fresh })
  if (!resp.success || !resp.data || typeof resp.data !== 'object') {
    throw new Error(resp.message || SNAPSHOT_LOAD_ERROR_COPY)
  }
  const data = resp.data as EquityDetail | CryptoSnapshotData
  if (!data.quote && (ref.market === 'US' || ref.market === 'HK')) {
    try {
      const quoteResp = await research.instrumentQuote(ref, { fresh: true })
      const q = quoteResp.success && quoteResp.data?.quote
        ? quoteResp.data.quote
        : null
      if (q) {
        return {
          ...data,
          quote: quoteDtoToCrossMarket(q),
        }
      }
    } catch { /* ignore */ }
  }
  return data
}

function detailFootnote(ref: InstrumentRef, quote: { quoteSession?: string; sessionLabel?: string } | null): string {
  if (ref.market === 'CRYPTO') {
    return 'Crypto 行情 7×24 更新，约每 30 秒自动刷新。'
  }
  if (
    (ref.market === 'US' || ref.market === 'HK')
    && quote
    && (quote.quoteSession === 'closed' || quote.sessionLabel === '收盘')
  ) {
    return '展示为收盘价与历史走势，盘中不实时更新。公司资料请通过助手查询。'
  }
  if (
    ref.market === 'US'
    && quote
    && (quote.quoteSession === 'pre' || quote.quoteSession === 'post')
  ) {
    return '当前为延长交易时段报价；盘中以常规时段为准。公司资料与新闻请通过助手查询。'
  }
  return '行情约每 1–2 分钟刷新；公司资料、财务与新闻请通过助手查询。'
}

export default function CrossMarketSnapshotDetail({
  stock,
  instrumentRef,
  loading = false,
  onManage,
}: Props) {
  const s = useStyles()
  /** 按标的身份稳定，避免父组件每次 render 新建 ref 对象导致轮询 effect 重跑 */
  const instrumentIdentity = useMemo(() => {
    if (instrumentRef) return instrumentKey(instrumentRef)
    return watchlistItemKey(stock)
  }, [
    instrumentRef?.market,
    instrumentRef?.assetClass,
    instrumentRef?.symbol,
    instrumentRef?.exchange,
    instrumentRef?.quote,
    stock.code,
    stock.instrument?.market,
    stock.instrument?.assetClass,
    stock.instrument?.symbol,
    stock.instrument?.exchange,
    stock.instrument?.quote,
    stock.industry,
  ])
  const ref = useMemo(
    () => instrumentRef ?? resolveWatchlistInstrument(stock),
    // identity 不变时保留同一对象引用
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by instrumentIdentity
    [instrumentIdentity],
  )
  const label = ref ? marketDisplayName(ref.market) : ''
  const isCrypto = ref?.market === 'CRYPTO'
  const isEquity = ref?.market === 'US' || ref?.market === 'HK'

  const [snapshotByKey, setSnapshotByKey] = useState<Record<string, EquityDetail | CryptoSnapshotData>>({})
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, setGraceTick] = useState(0)
  const loadSeqRef = useRef(0)
  const initialRetryRef = useRef(0)
  const freshLoadedRef = useRef<Set<string>>(new Set())
  const snapshotByKeyRef = useRef(snapshotByKey)
  snapshotByKeyRef.current = snapshotByKey
  const snapshot = snapshotByKey[instrumentIdentity] ?? null

  const load = useCallback(async (opts?: { fresh?: boolean }) => {
    if (!ref) return
    const seq = ++loadSeqRef.current
    setFetching(true)
    let scheduleRetry = false
    try {
      const data = await loadSnapshot(ref, { fresh: opts?.fresh })
      if (seq !== loadSeqRef.current) return
      setSnapshotByKey(prev => {
        const prior = prev[instrumentIdentity] ?? null
        return {
          ...prev,
          [instrumentIdentity]: mergeSnapshotPreserveQuote(prior, data),
        }
      })
      setError(null)
      initialRetryRef.current = 0
      if (opts?.fresh) freshLoadedRef.current.add(instrumentIdentity)
    } catch (e) {
      if (seq !== loadSeqRef.current) return
      const hadQuote = snapshotByKeyRef.current[instrumentIdentity]?.quote != null
      if (!hadQuote && initialRetryRef.current < SNAPSHOT_INITIAL_MAX_RETRIES) {
        initialRetryRef.current += 1
        scheduleRetry = true
        window.setTimeout(() => {
          void load({ fresh: true })
        }, SNAPSHOT_INITIAL_RETRY_MS * initialRetryRef.current)
        return
      }
      setError(e instanceof Error ? e.message : SNAPSHOT_LOAD_ERROR_COPY)
    } finally {
      if (seq === loadSeqRef.current && !scheduleRetry) {
        setFetching(false)
      }
    }
  }, [ref, instrumentIdentity])

  useEffect(() => {
    loadSeqRef.current += 1
    initialRetryRef.current = 0
    setError(null)
  }, [instrumentIdentity])

  useEffect(() => {
    if (!ref) return undefined
    const fresh = !freshLoadedRef.current.has(instrumentIdentity)
    void load({ fresh })
    const ms = isCrypto ? 30_000 : 90_000
    const timer = window.setInterval(() => { void load({ fresh: false }) }, ms)
    return () => window.clearInterval(timer)
  }, [load, isCrypto, instrumentIdentity, ref])

  useEffect(() => {
    if (!isWatchlistItemWithinQuoteGrace(stock)) return undefined
    const timer = window.setInterval(() => {
      setGraceTick(t => t + 1)
    }, 2000)
    return () => window.clearInterval(timer)
  }, [stock.addedAt])

  const equity = isEquity ? (snapshot as EquityDetail | null) : null
  const crypto = isCrypto ? (snapshot as CryptoSnapshotData | null) : null
  const quote = equity?.quote ?? crypto?.quote ?? null
  const klines = equity?.recentKlines ?? crypto?.recentKlines ?? []
  const withinQuoteGrace = isWatchlistItemWithinQuoteGrace(stock)
  const pendingInitialQuote = !quote && (fetching || withinQuoteGrace)
  const showQuoteError = Boolean(error && !quote && !fetching && !withinQuoteGrace)

  const tone = pctTone(quote?.changePct)
  const toneClass = mergeClasses(
    tone === 'up' && s.pctUp,
    tone === 'down' && s.pctDown,
    tone === 'flat' && s.pctFlat,
  )
  const priceDigits = isCrypto && (quote?.price ?? 0) < 1 ? 4 : 2
  const fmtPrice = (v: number | null | undefined) => (
    ref ? formatPriceForMarket(ref.market, v, priceDigits) : '—'
  )
  const fmtCompact = (v: number | null | undefined) => (
    ref ? formatCompactNumberForMarket(ref.market, v) : '—'
  )

  const displayName = useMemo(() => {
    if (!ref) return stock.name || stock.code
    if (equity?.name && equity.name !== equity.code) return equity.name
    if (stock.name && stock.name !== stock.code) return stock.name
    return quote?.name || displayCodeFromInstrument(ref)
  }, [equity, stock.name, stock.code, quote?.name, ref])

  if (!ref) {
    return (
      <div className={s.root}>
        <div className={s.hero}>
          <Text className={s.name}>{stock.name}</Text>
          <Text size={200} style={{ color: opptrixCssVars.textSecondary }}>
            {UNRESOLVED_INSTRUMENT_COPY.hint}
          </Text>
        </div>
      </div>
    )
  }

  const chartCode = formatInstrumentLabel(ref)
  const footnote = detailFootnote(
    ref,
    quote && ('quoteSession' in quote || 'sessionLabel' in quote)
      ? quote as { quoteSession?: string; sessionLabel?: string }
      : null,
  )

  if (isCrypto) {
    return (
      <div className={s.root}>
        <div className={s.hero}>
          <div className={s.titleRow}>
            <div className={s.titleMain}>
              <Text className={s.name}>{displayName}</Text>
              <span className={s.badge}>{label}</span>
            </div>
            {onManage && (
              <button type="button" className={s.manageBtn} onClick={onManage}>
                <EditRegular fontSize={12} />
                备注
              </button>
            )}
          </div>
          {loading || pendingInitialQuote ? (
            <Spinner size="tiny" label="正在获取行情…" />
          ) : quote ? (
            <div className={s.quoteMain}>
              <span className={mergeClasses(s.price, toneClass)}>{fmtPrice(quote.price)}</span>
              <span className={mergeClasses(s.change, toneClass)}>{formatPct(quote.changePct)}</span>
            </div>
          ) : showQuoteError ? (
            <Text className={s.error}>{error}</Text>
          ) : null}
        </div>
        <div className={s.cryptoBody}>
          <div className={s.card}>
            <Text className={s.cardTitle}>近 10 日走势</Text>
            <MiniKline bars={klines} formatPriceLabel={v => fmtPrice(v)} />
          </div>
          <Text className={s.foot}>{footnote}</Text>
        </div>
      </div>
    )
  }

  return (
    <div className={s.root}>
      <div className={s.hero}>
        <div className={s.titleRow}>
          <div className={s.titleMain}>
            <Text className={s.name}>{displayName}</Text>
            <span className={s.code}>{equity?.code ?? displayCodeFromInstrument(ref)}</span>
            <span className={s.badge}>{label}</span>
            {quote && 'sessionLabel' in quote && quote.sessionLabel ? (
              <span className={s.badge}>{quote.sessionLabel}</span>
            ) : null}
          </div>
          <div className={s.quoteMain}>
            {onManage && (
              <button type="button" className={s.manageBtn} onClick={onManage}>
                <EditRegular fontSize={12} />
                备注
              </button>
            )}
            {loading || pendingInitialQuote ? (
              <Spinner size="tiny" label="正在获取行情…" />
            ) : quote ? (
              <>
                <span className={mergeClasses(s.price, toneClass)}>{fmtPrice(quote.price)}</span>
                <span className={mergeClasses(s.change, toneClass)}>
                  {formatSignedNumber(quote.change ?? null, priceDigits)}
                </span>
                <span className={mergeClasses(s.change, toneClass)}>
                  {formatPct(quote.changePct)}
                </span>
              </>
            ) : null}
          </div>
        </div>
        {quote ? (
          <div className={s.heroGrid}>
            <HeroCell label="开" value={fmtPrice(quote.open ?? null)} />
            <HeroCell label="高" value={fmtPrice(quote.high ?? null)} />
            <HeroCell label="低" value={fmtPrice(quote.low ?? null)} />
            <HeroCell label="昨" value={fmtPrice(quote.preClose ?? null)} />
            <HeroCell label="量" value={formatVolume(quote.volume ?? null)} />
            <HeroCell label="额" value={fmtCompact(quote.amount ?? null)} />
            <HeroCell label="换手" value={quote.turnoverRate != null ? `${quote.turnoverRate.toFixed(2)}%` : '—'} />
            <HeroCell label="市值" value={fmtCompact(quote.marketCap ?? null)} />
            {quote.week52High != null ? (
              <HeroCell label="52周高" value={fmtPrice(quote.week52High)} />
            ) : null}
            {quote.circulatingMarketCap != null ? (
              <HeroCell label="流通值" value={fmtCompact(quote.circulatingMarketCap)} />
            ) : null}
          </div>
        ) : showQuoteError ? (
          <Text className={s.error}>{error}</Text>
        ) : null}
      </div>

      <div className={s.chartBody}>
        <div className={s.chartPanel}>
          <TradingViewChart code={chartCode} instrument={ref} expanded active />
        </div>
        {error && quote ? <Text className={s.error}>刷新失败：{error}</Text> : null}
        <Text className={s.foot} style={{ padding: `0 ${CONTENT_PAD} 10px` }}>{footnote}</Text>
      </div>
    </div>
  )
}
